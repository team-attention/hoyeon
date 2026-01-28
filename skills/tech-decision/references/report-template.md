# Technical Decision Report Template

## Overall Structure

```markdown
# Technical Decision Report: [Topic]

**Date**: YYYY-MM-DD
**Decision Type**: [Library Selection | Architecture Decision | Implementation Approach | Technology Stack]

---

## 1. Conclusion (Executive Summary)

**Recommendation: [Option Name]**

[Summarize the key reasons for recommendation in 1-2 sentences]

**Confidence Level**: [High | Medium | Low] - [Basis for confidence assessment]

---

## 2. Decision Context

### 2.1 Problem Definition
[Clearly describe what needs to be decided]

### 2.2 Comparison Options
- Option A: [Name] - [One-line description]
- Option B: [Name] - [One-line description]
- Option C: [Name] - [One-line description]

### 2.3 Project Context
- **Project Scale**: [Small | Medium | Large]
- **Team Size**: [N people]
- **Existing Technology Stack**: [Related technologies]
- **Special Requirements**: [Describe if any]

---

## 3. Evaluation Criteria

| Criteria | Weight | Description |
|------|--------|------|
| [Criteria 1] | [X%] | [Why it's important] |
| [Criteria 2] | [X%] | [Why it's important] |
| [Criteria 3] | [X%] | [Why it's important] |
| [Criteria 4] | [X%] | [Why it's important] |
| **Total** | **100%** | |

---

## 4. Detailed Analysis by Option

### 4.1 Option A: [Name]

**Overview**: [2-3 sentence description]

**Advantages**:
- ✅ [Advantage 1]
  - Source: [Official Documentation | Reddit | HN | Expert Opinion | Code Analysis]
  - Confidence: [High | Medium | Low]

- ✅ [Advantage 2]
  - Source: [...]
  - Confidence: [...]

**Disadvantages**:
- ❌ [Disadvantage 1]
  - Source: [...]
  - Confidence: [...]

**Suitable Cases**:
- [Scenario 1]
- [Scenario 2]

**Unsuitable Cases**:
- [Scenario 1]
- [Scenario 2]

---

### 4.2 Option B: [Name]
[Repeat with same structure]

---

### 4.3 Option C: [Name]
[Repeat with same structure]

---

## 5. Comprehensive Comparison Table

### 5.1 Score by Criteria (out of 5)

| Criteria (Weight) | Option A | Option B | Option C |
|---------------|----------|----------|----------|
| [Criteria 1] (X%) | ⭐⭐⭐⭐ (4) | ⭐⭐⭐ (3) | ⭐⭐⭐⭐⭐ (5) |
| [Criteria 2] (X%) | ⭐⭐⭐ (3) | ⭐⭐⭐⭐⭐ (5) | ⭐⭐ (2) |
| [Criteria 3] (X%) | ⭐⭐⭐⭐ (4) | ⭐⭐⭐⭐ (4) | ⭐⭐⭐ (3) |
| **Weighted Average** | **X.X** | **X.X** | **X.X** |

### 5.2 Quick Comparison

| Aspect | Option A | Option B | Option C |
|------|----------|----------|----------|
| Learning Curve | Steep | Gentle | Moderate |
| Community | Very Active | Growing | Stable |
| Maturity | Mature | Nascent | Mature |
| Bundle Size | Large | Small | Medium |

---

## 6. Recommendation Rationale

### 6.1 Key Rationale

1. **[Rationale 1 Title]**
   - Description: [Detailed description]
   - Source: [Specific source]

2. **[Rationale 2 Title]**
   - Description: [Detailed description]
   - Source: [Specific source]

3. **[Rationale 3 Title]**
   - Description: [Detailed description]
   - Source: [Specific source]

### 6.2 Project Context-Based Judgment

[Explain why this choice is appropriate in light of the current project situation]

---

## 7. Risks and Considerations

### 7.1 Risks of Adoption

| Risk | Impact | Likelihood | Mitigation Strategy |
|--------|--------|-------------|-----------|
| [Risk 1] | [High|Medium|Low] | [High|Medium|Low] | [Strategy] |
| [Risk 2] | [...] | [...] | [...] |

### 7.2 Migration Considerations

- [Consideration 1]
- [Consideration 2]

### 7.3 Long-term Considerations

- [Consideration 1]
- [Consideration 2]

---

## 8. Alternative Scenarios

### 8.1 If [Condition A]?
→ [Option Y] might be more suitable. Reason: [...]

### 8.2 If [Condition B]?
→ Consider [Option Z]. Reason: [...]

---

## 9. References

### Official Documentation
- [Link 1]
- [Link 2]

### Community Discussion
- [Reddit/HN Link 1]
- [Reddit/HN Link 2]

### Blog/Articles
- [Link 1]
- [Link 2]

### Benchmark/Comparison Materials
- [Link 1]
- [Link 2]

---

## 10. Conclusion Reconfirmation

**Final Recommendation: [Option Name]**

[Summarize the key reasons one more time]

**Next Steps**:
1. [Specific action item 1]
2. [Specific action item 2]
3. [Specific action item 3]
```

## Simplified Version (Quick Decision)

For cases requiring quick decisions:

```markdown
# Quick Decision: [Topic]

## Conclusion
**Recommendation: [Option Name]** - [One-line reason]

## Comparison
| | Option A | Option B |
|---|----------|----------|
| Advantages | [1-2 items] | [1-2 items] |
| Disadvantages | [1-2 items] | [1-2 items] |
| Suitable for | [Scenario] | [Scenario] |

## Key Rationale
1. [Rationale 1]
2. [Rationale 2]

## Caution
- [Caution item]
```
