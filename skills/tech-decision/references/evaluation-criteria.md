# Evaluation Criteria Guide

Recommended evaluation criteria by decision type.

## Library/Framework Selection

| Criteria | Description | Measurement Method |
|------|------|-----------|
| **Performance** | Speed, memory usage, bundle size | Benchmarks, official documentation |
| **Learning Curve** | Time required for team to learn | Documentation quality, tutorial quantity, concept complexity |
| **Ecosystem** | Plugins, extensions, third-party tools | npm package count, GitHub stars |
| **Community** | Activity level, Q&A response speed | Stack Overflow question count, Discord/Slack activity |
| **Maintainability** | Long-term support, update frequency | Release cycle, issue resolution speed |
| **Type Support** | TypeScript support level | Built-in types, @types quality |
| **Documentation** | Official documentation quality | Example richness, recency, searchability |
| **Adoption Rate** | Industry usage status | npm downloads, enterprise use cases |

### Weighting Examples

**Startup (Fast Development Focus)**:
- Learning Curve: 30%
- Ecosystem: 25%
- Documentation: 20%
- Performance: 15%
- Maintainability: 10%

**Enterprise (Stability Focus)**:
- Maintainability: 30%
- Type Support: 20%
- Community: 20%
- Performance: 15%
- Documentation: 15%

---

## Architecture Pattern Decision

| Criteria | Description | Measurement Method |
|------|------|-----------|
| **Scalability** | Ease of handling increased load | Horizontal/vertical scaling capability |
| **Complexity** | Implementation and operational complexity | Required infrastructure, learning cost |
| **Team Size Fit** | Suitability for team size | Conway's Law consideration |
| **Deployment Ease** | CI/CD complexity | Number of pipeline stages |
| **Failure Isolation** | Overall impact during partial failures | Independent deployment capability |
| **Data Consistency** | Transaction handling | ACID vs Eventually Consistent |
| **Operational Cost** | Infrastructure and personnel costs | Number of servers, required DevOps personnel |
| **Development Speed** | Initial development ~ MVP | Boilerplate, configuration complexity |

### Weighting Examples

**Early Startup (MVP)**:
- Development Speed: 35%
- Complexity: 25%
- Operational Cost: 20%
- Scalability: 10%
- Others: 10%

**Growth Stage (Scale-up)**:
- Scalability: 30%
- Failure Isolation: 20%
- Team Size Fit: 20%
- Deployment Ease: 15%
- Operational Cost: 15%

---

## Implementation Approach Decision

| Criteria | Description | Measurement Method |
|------|------|-----------|
| **Implementation Complexity** | Code volume, difficulty | LoC, abstraction level |
| **Testability** | Difficulty of writing unit/integration tests | Mocking needs, dependencies |
| **Debuggability** | Difficulty of tracking issues | Logging, tracing support |
| **Performance Characteristics** | Latency, throughput | Benchmarks |
| **Resource Usage** | CPU, memory, network | Profiling |
| **Existing Code Compatibility** | Fit with current architecture | Amount of refactoring needed |
| **Maintainability** | Ease of long-term management | Code readability, documentation |

---

## Database Selection

| Criteria | Description | Measurement Method |
|------|------|-----------|
| **Data Model** | Relational/document/graph/key-value | Requirements matching |
| **Query Flexibility** | Support for complex queries | SQL/NoSQL capabilities |
| **Scalability** | Ease of horizontal scaling | Sharding, replication |
| **Consistency** | ACID vs BASE | Transaction requirements |
| **Performance** | Read/write speed | Benchmarks |
| **Operational Complexity** | Management overhead | Backup, monitoring, migration |
| **Cost** | License, infrastructure | TCO calculation |
| **Ecosystem** | ORM, drivers, tools | Supported languages/frameworks |

---

## Recommended Criteria by Situation

### "Need to build MVP quickly"
Priority: Learning Curve > Development Speed > Documentation > Others

### "Expecting large-scale traffic"
Priority: Performance > Scalability > Operational Cost > Others

### "Small team (1-3 people)"
Priority: Low Complexity > Documentation > Community > Others

### "Enterprise environment"
Priority: Security > Maintainability > Type Support > Others

### "Legacy system integration"
Priority: Existing Code Compatibility > Migration Ease > Others

---

## Reliability Assessment Criteria

Reliability by information source:

| Source | Reliability | Notes |
|------|--------|------|
| Official documentation | High | Accurate but may be biased |
| Benchmarks (independent) | High | Conditions need verification |
| GitHub Issues | Medium-High | Real usage experience |
| Stack Overflow | Medium | Date verification needed |
| Reddit/HN | Medium | Diverse perspectives, some noise |
| Blogs | Low-Medium | Check author background |
| Marketing materials | Low | Biased |

**Ways to increase reliability**:
- Verify same information from multiple sources
- Prioritize recent dates
- Prioritize opinions based on actual usage experience
- Verify conditions/environment for benchmarks
