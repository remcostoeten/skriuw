# Model.go Refactoring TODO

## Problem
`internal/app/model.go` is a large file (~921 lines) with high complexity:
- 15+ state types
- Complex Update logic routing to many handlers
- Multiple concerns: menu navigation, process orchestration, form handling, terminal/AI modes

## Proposed Solution
Split `model.go` into smaller, focused files:

### Suggested Structure
- `model.go` - Core Model struct, state constants, InitialModel, main Update/View routing
- `menu_handler.go` - Menu navigation and selection handling
- `process_handler.go` - Server, build, deploy, and tool process state handlers
- `form_handler.go` - Config add form logic
- `terminal_handler.go` - Terminal mode handling (move from terminal_ai.go)
- `ai_handler.go` - AI mode handling (move from terminal_ai.go)

### Benefits
- Improved maintainability
- Easier to test individual concerns
- Better code organization
- Reduced cognitive load when reading code

## Priority
Medium - Not blocking, but would improve code quality and maintainability

## Estimated Effort
~2-3 hours for careful refactoring and testing

