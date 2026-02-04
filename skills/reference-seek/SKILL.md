---
name: reference-seek
description: |
  This skill should be used when the user asks to "find references", "참고할 만한 거",
  "similar implementation", "오픈소스 있나", "how others do this", "레퍼런스 찾아줘",
  or needs to find existing patterns (internal) and open-source examples (external)
  for implementing a feature.
version: 0.1.0
---

# Reference Seek - Find Implementation References

Find internal patterns and external open-source examples to reference when implementing features.

## Purpose

When building a feature, find what you can **reuse** or **learn from**:
- Internal: Existing patterns in the codebase
- External: Open-source projects, implementation examples, blog posts

## Use Cases

- "OAuth 로그인 구현하려는데 참고할 만한 거 있나?"
- "Find references for implementing a rate limiter"
- "pagination 어떻게 구현하지? 레퍼런스 찾아줘"
- "WebSocket 연결 관리 비슷한 오픈소스?"

## Execution

### Step 1: Topic Extraction

Extract the implementation topic from user request.

Examples:
- "OAuth 로그인 구현" → `OAuth authentication`
- "rate limiter 참고할 만한 거" → `rate limiting`
- "pagination 레퍼런스" → `pagination implementation`

### Step 2: Parallel Search (Single Message)

Run internal and external searches **in parallel**:

**Internal (Explore agent)**:
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

**External (WebSearch, parallel)**:
```
WebSearch: "{topic} implementation github"
WebSearch: "{topic} open source example"
WebSearch: "{topic} tutorial best practices"
```

**CRITICAL**: Run all 4 searches in **one message** in parallel.

### Step 3: Synthesize & Present

#### 3-1. Internal References

From Explore results, identify:
- **Directly Reusable**: Code that can be used as-is or with minor changes
- **Pattern Reference**: Similar patterns to follow
- **Integration Points**: Where the new feature would connect

#### 3-2. External References

From WebSearch results, categorize:
- **Open Source Projects**: GitHub repos with similar functionality
- **Implementation Examples**: Blog posts, tutorials with code
- **Best Practices**: Guides on how to approach the problem

#### 3-3. Usage Suggestions

Synthesize actionable advice:
- What internal code to reuse
- Which external examples are most relevant
- Potential pitfalls mentioned in references

## Output Format

```markdown
## 🔍 Reference Seek: [{TOPIC}]

### Internal References (코드베이스)

#### Directly Reusable
- `{file}:{lines}` - {description}, {how to reuse}

#### Pattern Reference
- `{file}:{lines}` - {pattern description}, {how it applies}

#### Integration Points
- `{file}:{lines}` - {where new feature connects}

---

### External References (오픈소스/사례)

#### Open Source Projects
1. **[{project-name}]({github-url})**
   - What: {brief description}
   - Relevant: {specific file or feature to look at}
   - Stars: {N}k

#### Implementation Examples
1. **[{title}]({url})**
   - Key insight: {what you can learn}

#### Best Practices
- {practice 1} - Source: [{title}]({url})
- {practice 2} - Source: [{title}]({url})

---

### 💡 Usage Suggestions

1. **Reuse**: {what internal code to leverage}
2. **Reference**: {which external example is most relevant and why}
3. **Watch out**: {potential pitfalls from references}
```

## Search Query Tips

| Topic Type | Query Pattern |
|------------|---------------|
| Feature impl | `"{feature} implementation github"` |
| Library usage | `"{library} example tutorial"` |
| Pattern | `"{pattern} best practices"` |
| Specific tech | `"{tech} {feature} open source"` |

## Error Handling

| Situation | Response |
|-----------|----------|
| No internal matches | Note "No existing patterns found", focus on external |
| No external results | Try alternative keywords, broaden search |
| Topic too vague | Ask user to clarify specific aspect |
| Too many results | Prioritize by stars (GitHub) or recency |

## Notes

1. **Prioritize actionability**: Focus on what can actually be used, not just "related" code
2. **Include context**: Why each reference is relevant
3. **Be specific**: Link to exact files/lines, not just repos
4. **Freshness matters**: Note if external references are outdated
