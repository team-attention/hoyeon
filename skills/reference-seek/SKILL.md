---
name: reference-seek
description: |
  This skill should be used when the user asks to "find references", "참고할 만한 거",
  "similar implementation", "오픈소스 있나", "how others do this", "레퍼런스 찾아줘",
  or needs to find existing patterns (internal) and open-source examples (external)
  for implementing a feature.
version: 2.0.0
validate_prompt: |
  Must contain all of these sections:
  - Internal References section (with content or "No existing patterns found" message)
  - GitHub References section with at least 1 repo entry including stars, license, and updated date
  - At least 1 repo with actual code excerpt (Key Code block with real source lines)
  - Usage Suggestions section with numbered recommendations
  Output must start with "## Reference Seek:" header.
---

# Reference Seek - Find Implementation References (v2.0.0)

Find internal patterns, quality-filtered GitHub repos with code-level insights, official docs, and external examples.

## Purpose

When building a feature, find what you can **reuse** or **learn from**:
- Internal: Existing patterns in the codebase
- GitHub: Quality-filtered repos with actual code excerpts
- Official Docs: context7-powered library documentation
- External: Blog posts, tutorials, best practices

## Use Cases

- "OAuth 로그인 구현하려는데 참고할 만한 거 있나?"
- "Find references for implementing a rate limiter"
- "pagination 어떻게 구현하지? 레퍼런스 찾아줘"
- "WebSocket 연결 관리 비슷한 오픈소스?"

## Execution

### Step 0: Dependency Check + Topic Classification (1 message)

Run in parallel:

**0-A. gh auth check:**
```bash
gh auth status
```

| Result | Variable |
|--------|----------|
| Authenticated | `GH_AVAILABLE=true` |
| Not authenticated / gh not found | `GH_AVAILABLE=false` |

**0-B. Topic extraction + classification (reasoning, same message):**

Extract from user request:
- `TOPIC`: Normalized English topic (e.g., "rate limiting", "OAuth authentication")
- `TOPIC_CLASS`: `library` | `pattern` | `concept`
- `GH_QUERY`: GitHub search query (e.g., `rate+limiter`, `oauth+middleware`)
- `GH_LANG_FILTER`: Language filter inferred from codebase (e.g., `+language:typescript`)
- `CONTEXT7_LIB`: Library name for context7 resolve (if `library` class, use directly; otherwise best guess or skip)

Examples:
- "rate limiter 참고할 만한 거" → TOPIC: `rate limiting`, CLASS: `pattern`, GH_QUERY: `rate+limiter+middleware`, CONTEXT7_LIB: `rate-limiter-flexible`
- "NextAuth 구현 레퍼런스" → TOPIC: `NextAuth authentication`, CLASS: `library`, GH_QUERY: `nextauth+authentication`, CONTEXT7_LIB: `next-auth`
- "pagination 레퍼런스" → TOPIC: `pagination implementation`, CLASS: `pattern`, GH_QUERY: `pagination+cursor`, CONTEXT7_LIB: skip

### Step 1: Parallel Search (1 message, up to 4 sources)

**CRITICAL**: Run all available tracks in **one message** in parallel.

| Track | Tool | Purpose |
|-------|------|---------|
| 1-A | `Task(Explore)` | Internal codebase pattern search |
| 1-B | `Bash: gh api search/repositories` | GitHub repo search (stars-sorted, top 10) |
| 1-C | `mcp__context7__resolve-library-id` | Library docs ID lookup |
| 1-D | `WebSearch` | Blog/tutorial search (1 query only) |

**1-A. Internal Search (Explore agent):**
```
Task(subagent_type="Explore",
     prompt="""
Find existing patterns related to [{TOPIC}] in this codebase.
Look for:
- Similar implementations or utilities
- Patterns that could be reused or extended
- Related helper functions or modules

Report as file:line format with brief description of what's reusable.
""")
```

**1-B. GitHub Search (only if GH_AVAILABLE=true):**
```bash
gh api "search/repositories?q={GH_QUERY}+{GH_LANG_FILTER}&sort=stars&per_page=10" \
  --jq '.items[] | select(.archived == false) | {
    full_name, stars: .stargazers_count, lang: .language,
    topics, license: .license.spdx_id, desc: .description,
    pushed: .pushed_at, url: .html_url, default_branch
  }'
```

**1-C. context7 resolve (if CONTEXT7_LIB is set):**
```
mcp__context7__resolve-library-id(libraryName="{CONTEXT7_LIB}")
```

**1-D. WebSearch (1 query only):**
```
WebSearch: "{TOPIC} implementation tutorial best practices 2024 2025"
```

**When GH_AVAILABLE=false:** Skip 1-B. Run WebSearch 3 times instead (v1.0 fallback):
```
WebSearch: "{TOPIC} implementation github"
WebSearch: "{TOPIC} open source example"
WebSearch: "{TOPIC} tutorial best practices"
```
Add warning at top of output: `> ⚠️ GitHub API unavailable (gh not authenticated). Results from web search only.`

### Step 2: Quality Filter + context7 Query (sequential after Step 1)

**2-A. Quality Filter (reasoning, applied to 1-B results):**

| Criteria | Threshold |
|----------|-----------|
| Stars | >= 100 (relax to >= 50 if fewer than 2 pass) |
| Last push | Within 24 months |
| License | MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, MPL-2.0 |
| Archived | Excluded (already filtered by jq) |

→ Top 5 passing repos = `QUALIFIED_REPOS`
→ Top 1-2 repos = `DEEP_DIVE_TARGETS`

If all repos filtered out: relax stars to >= 50. If still none, take top 3 with warning badge `⚠️ Below quality threshold`.

**2-B. context7 docs query (only if 1-C resolve succeeded):**
```
mcp__context7__query-docs(
  libraryId="{resolved_id}",
  query="{TOPIC} implementation patterns examples"
)
```
If resolve failed in 1-C, skip this step entirely.

### Step 3: Repo Deep Dive (sequential after Step 2)

For each repo in `DEEP_DIVE_TARGETS` (1-2 repos):

**3-1. File tree lookup:**
```bash
gh api "repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1" \
  --jq '[.tree[] | select(.type=="blob") | select(.path | test("^(src|source|lib|pkg|core)/")) | {path, size}]'
```

**3-2. File selection (reasoning):**
- Match files by topic keywords
- Prioritize: entry points, types/interfaces, core logic
- Skip files > 20KB
- Select max 3 files per repo

**3-3. File content fetch:**
```bash
curl -s "https://raw.githubusercontent.com/{owner}/{repo}/{default_branch}/{path}"
```

**3-4. Code analysis (reasoning):**
Extract from each file:
- Key data structures
- Algorithm / approach
- Configuration options
- Notable patterns worth adopting

If file tree or fetch fails for a repo, skip its deep dive and move to the next target.

### Step 4: Synthesize & Present

Combine all sources into the output format below.

## Output Format

```markdown
## Reference Seek: [{TOPIC}]

> Sources: Internal | GitHub ({N} repos, quality-filtered) | context7 | Web

---

### Internal References (코드베이스)

#### Directly Reusable
- `{file}:{lines}` - {description}

#### Pattern Reference
- `{file}:{lines}` - {pattern description}

#### Integration Points
- `{file}:{lines}` - {connection point}

---

### GitHub References (품질 필터링됨)

1. **[{owner}/{repo}]({url})** ★{stars} | {lang} | {license} | Updated {date}
   - What: {description}
   - Topics: {topics}
   - **Key Code (`{path}`):**
     ```{lang}
     {10-30 lines of key code}
     ```
   - Takeaway: {actionable insight}

2. **[{owner}/{repo}]({url})** ★{stars} | {lang} | {license} | Updated {date}
   - What: {description}
   - Topics: {topics}
   - **Key Code (`{path}`):**
     ```{lang}
     {10-30 lines of key code}
     ```
   - Takeaway: {actionable insight}

3-5. (metadata only, no code excerpt)
3. **[{owner}/{repo}]({url})** ★{stars} | {lang} | {license} | Updated {date}
   - What: {description}

*(Filtered out: {N} repos excluded — low stars / outdated / incompatible license)*

---

### Official Docs (context7)

> Only include this section if context7 resolve succeeded in Step 1-C.

- {key concept}: {docs content}
- **Official Code Example:**
  ```{lang}
  {official example from docs}
  ```

---

### External References (블로그/튜토리얼)

1. **[{title}]({url})** - Key insight: {content}

---

### Usage Suggestions

1. **Reuse**: {how to leverage internal code}
2. **Reference**: {most relevant repo + why}
3. **Official**: {key takeaway from context7/docs}
4. **Watch out**: {pitfalls or caveats}
```

## Error Handling

| Situation | Response |
|-----------|----------|
| gh not authenticated | Skip 1-B, use WebSearch 3x fallback, add warning at top |
| gh rate limit (403) | Fallback: `gh search repos "{GH_QUERY}" --sort stars --limit 10 --json ...` (different rate limit bucket) |
| GH results 0 | Remove language filter, retry. If still 0, show "No GitHub results found" |
| All repos filtered out | Relax stars to >= 50. If still none, show top 3 with warning badge |
| context7 resolve fails | Omit "Official Docs" section entirely |
| File tree / fetch fails | Skip that repo's deep dive, proceed to next target |
| Explore returns nothing | Show "No existing patterns found in codebase" |
| Topic too vague | Ask user for clarification before proceeding |
