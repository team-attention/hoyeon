# Weather Script - Work Plan

## Context

### Goal
Create a simple weather checking Python script

### Background
- Simple script for experimental/learning purpose
- Located in `.playground/` directory (git-ignored)

### Gap Analysis Summary
- Error handling: simple message output is sufficient
- Output format: plain text
- Network timeout: 10 seconds
- Location argument: must support city names with spaces ("New York")

---

## Work Objectives

### Must Do
- [ ] Query current weather using wttr.in API
- [ ] Accept location via CLI argument
- [ ] Output temperature, weather status, and humidity
- [ ] Basic error handling (network errors, location not found)

### Must NOT Do
- Prohibited to create requirements.txt, setup.py
- Prohibited to add caching, storage features
- Prohibited to use CLI frameworks like Click, Typer (use sys.argv)
- Prohibited to add config files, environment variable dependencies
- Prohibited to add production features like logging, metrics
- Prohibited to add out-of-scope features like forecasts, multiple locations

---

## Technical Approach

### API
- Endpoint: `https://wttr.in/{location}?format=j1`
- Parse `current_condition` from JSON response

### Dependencies
- `requests` (pip install requests)

### File Structure
```
.playground/
└── weather.py    # Single file
```

---

## Work Items

### TODO-1: Write weather.py script

**What**: Write Python script to query current weather using wttr.in API

**Implementation**:
1. Accept location argument via sys.argv
2. Call wttr.in API with requests (timeout=10)
3. Parse current_condition from JSON response
4. Output temperature(°C), weather status, humidity(%)
5. Output friendly message on error

**Must NOT Do**:
- Prohibited to use argparse (use sys.argv directly)
- Prohibited to add retry logic, exponential backoff
- Prohibited to parse forecast data

**Parallelizable**: No (Single task)

**References**:
- wttr.in API: https://wttr.in/:help

**Acceptance Criteria**:
- [ ] `python .playground/weather.py Seoul` outputs current weather when executed
- [ ] `python .playground/weather.py "New York"` city names with spaces work
- [ ] Outputs usage instructions when executed without arguments
- [ ] Outputs error message on invalid location
- [ ] Outputs error message on network error

**Commit**: `feat: add weather script using wttr.in API`

---

## Task Flow

```
[TODO-1] Write weather.py
    ↓
  Complete
```

## Parallelization

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | TODO-1 | Script writing and testing |

---

## Completion Protocol

### Quality Checks
- [ ] Script execution: `python .playground/weather.py Seoul` → Weather output
- [ ] Error cases: test no argument, invalid location, network error
- [ ] Location with spaces: `python .playground/weather.py "New York"` → Works correctly

### Final Commit
- [ ] Commit after passing Quality Checks: `feat: add weather script using wttr.in API`
