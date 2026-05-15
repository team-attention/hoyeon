---
type: feature
goal: Add a visible todo completion toggle with persistent state.
non_goals:
  - Add authentication or cross-device sync.
---

# Requirements

## R-U1: Todo completion interaction

#### R-U1.1: Toggle completion state

- given: A user is viewing an incomplete todo item.
- when: The user activates the completion toggle.
- then: The todo item is marked complete and the visible state updates.

#### R-U1.2: Restore completion state

- given: A user has marked a todo item complete.
- when: The app is reloaded.
- then: The todo item remains marked complete.

## R-T1: Local persistence

#### R-T1.1: Persist completion changes locally

- given: The app stores todos locally.
- when: A todo completion state changes.
- then: The updated completion value is written to local storage.

