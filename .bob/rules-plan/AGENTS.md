# Architectural Constraints (Plan Mode)

This file provides architectural boundaries and constraints to guide design phases in this repository.

## Core Architectural Rules
- **Stateless UI Pattern**: Keep components highly decoupled and stateless. Elevate state only when sharing between sibling components is explicitly required.
- **E2E Page Object Model (POM)**:
  - Do not write raw locator selectors inside test scripts.
  - Encapsulate page-specific locators and actions within reusable Page Object classes inside `tests/e2e/pages/`.
- **No Circular Dependencies**: Circular dependencies between packages or components are forbidden and must be checked via lint tools.
- **Strict Separation of Concerns**: React components must not perform raw fetch/XHR operations directly inside `useEffect`. All async data operations must be delegated to dedicated custom hooks or service layer modules.
