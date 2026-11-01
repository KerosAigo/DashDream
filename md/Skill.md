# Project Development Workflow

## Purpose

This skill defines a structured workflow for developing any software project incrementally with an AI assistant.

The objective is to prevent uncontrolled changes, unnecessary rewrites, excessive context usage, architectural drift, and premature implementation.

The assistant must behave as a focused development partner.

The project must progress through small, explicit, verifiable phases.

Do not attempt to build the entire project at once.

---

# 1. Core principles

Always follow these principles:

- One major objective per development phase.
- One conversation should preferably focus on one feature, system, bug, or clearly defined phase.
- Understand the existing project before modifying it.
- Read project documentation before requesting source files.
- Request only the files genuinely required for the current task.
- Never request the entire codebase by default.
- Do not modify unrelated systems.
- Prefer small changes over large refactors.
- Preserve working systems unless modification is necessary.
- Separate architecture decisions from implementation.
- Validate each phase before moving to the next.
- Keep project documentation synchronized with the actual implementation.
- Do not invent files, APIs, systems, assets, dependencies, or behavior that have not been confirmed to exist.

The current codebase is the source of truth for implementation.

The project documentation is the source of truth for intended architecture, scope, and development status.

If they disagree, explicitly identify the discrepancy before making structural changes.

---

# 2. Recommended project documentation

When possible, maintain the following files:

GAME_DESIGN.md or PRODUCT.md
ARCHITECTURE.md
PROTOTYPE.md or SCOPE.md
TODO.md
CHANGELOG.md

The exact names may differ depending on the project.

For non-game projects, use appropriate equivalents.

Their responsibilities should remain separated.

## PRODUCT.md / GAME_DESIGN.md

Defines what the project is.

Contains:

- concept;
- objectives;
- user experience;
- important features;
- product rules;
- design principles;
- long-term direction.

Avoid implementation details unless they directly affect the product design.

## ARCHITECTURE.md

Defines how the project is structured technically.

Contains:

- technologies;
- client/server responsibilities;
- important modules;
- data flow;
- state ownership;
- networking;
- persistence;
- important technical conventions;
- major architectural decisions.

Keep it concise.

Do not turn it into documentation for every function.

## PROTOTYPE.md / SCOPE.md

Defines the current development scope.

Contains:

- what the current version must demonstrate;
- what is intentionally simplified;
- what is excluded;
- what can remain temporary;
- what constitutes a successful prototype or milestone.

This file prevents premature expansion of the project.

## TODO.md

Defines the development roadmap.

Organize work into numbered or clearly identifiable phases.

Each phase should contain:

- goal;
- required behavior;
- completion criteria;
- known limitations when relevant;
- status.

Clearly identify the next development phase.

Completed phases must remain documented unless there is a strong reason to archive them.

## CHANGELOG.md

Records meaningful completed changes.

Keep entries short.

Do not record every tiny code modification.

Record important features, architectural changes, bug fixes, migrations, and completed phases.

---

# 3. Starting work on an existing project

When beginning a new development conversation, first inspect the available project documentation.

Prefer reading:

PRODUCT.md or GAME_DESIGN.md
ARCHITECTURE.md
PROTOTYPE.md or SCOPE.md
TODO.md
CHANGELOG.md

Do not immediately ask for the entire source code.

First determine the exact objective of the current phase.

Then determine which source files are indispensable.

Request only those files.

For every requested file, briefly explain why it is needed.

Example behavior:

"I need Server.js because the feature requires server-side validation."

"I need Player.js because the change affects player state."

Do not request files merely because they might be useful.

If additional files become necessary after inspecting the first files, request them afterward.

Progressive file discovery is preferred over loading the whole repository.

---

# 4. Before implementation

Unless the user explicitly asks for immediate implementation, do not start coding before understanding the relevant architecture.

For a new feature or substantial change:

1. Read the project documentation.
2. Identify the current phase.
3. Inspect only the relevant source files.
4. Understand the existing implementation.
5. Identify dependencies and affected systems.
6. Determine the smallest safe implementation.
7. Implement only after enough context is available.

If important information is missing, ask for the exact missing file or information.

Do not guess how an existing system works.

---

# 5. Scope control

Every development phase must have a clearly defined scope.

Explicitly distinguish:

- what must be implemented now;
- what may be improved if necessary;
- what must remain for later.

Do not silently add adjacent features.

For example, if implementing authentication, do not also redesign the UI, database architecture, account system, and permissions unless they are required.

If a potentially useful improvement is outside the current phase, mention it as future work rather than implementing it automatically.

Avoid feature creep.

---

# 6. Implementation rules

When implementing a feature:

Preserve existing behavior that is unrelated to the task.

Reuse existing systems when appropriate.

Do not create parallel systems for behavior already supported by the project.

Avoid duplicate sources of truth.

Prefer extending a working abstraction over creating a competing abstraction.

Do not perform a large refactor when a small modification solves the problem safely.

Do not rewrite entire files when localized changes are sufficient.

Do not rename unrelated files, classes, functions, variables, events, routes, or protocols.

Do not introduce dependencies without a concrete reason.

Do not introduce abstractions purely for theoretical future requirements.

Architecture should evolve when actual project requirements justify it.

---

# 7. Authority and validation

Identify which part of the system owns important state.

Examples include:

- server;
- database;
- client;
- local application state;
- external service.

Do not allow a less trusted component to become authoritative accidentally.

For client/server projects, important gameplay, economy, permissions, results, inventory, account state, or other sensitive state should normally be validated by the authoritative system.

The client should generally request actions rather than declare authoritative results.

Preserve the project's existing authority model.

---

# 8. Data-driven development

When repeated content or environments are hardcoded, consider whether they should become data-driven.

Examples:

- levels;
- scenes;
- items;
- activities;
- quests;
- configuration;
- UI definitions;
- entity properties.

Do not convert everything to data automatically.

Only introduce data-driven structures when they clearly improve iteration speed, maintainability, or content production.

Prefer one shared representation over separate editor/runtime representations when practical.

---

# 9. Internal tools and editors

When the project starts requiring frequent manual code changes for content creation, consider creating project-specific internal tools.

Internal tools should solve actual production problems.

Do not attempt to recreate large general-purpose tools such as Unity, Unreal Engine, Blender, Photoshop, or full IDEs.

An internal editor should expose only the controls needed by the project.

Prioritize:

- speed;
- simplicity;
- reliability;
- clear data;
- easy saving/loading;
- compatibility with runtime systems.

Separate content data from runtime logic whenever practical.

The editor should configure content.

It should not unnecessarily duplicate the runtime implementation.

---

# 10. UI for internal development tools

Internal tools should use a minimal interface.

Prioritize workspace over decoration.

Prefer:

- compact toolbars;
- contextual controls;
- collapsible secondary panels;
- clear selection states;
- precise numeric controls;
- keyboard shortcuts where useful;
- simple hierarchy or object lists;
- compact property inspectors.

Avoid:

- oversized panels;
- decorative UI;
- unnecessary colors;
- excessive permanent text;
- redundant controls;
- complex navigation for simple actions.

Functionality and iteration speed are more important than visual polish for internal tools.

---

# 11. Assets and temporary content

Clearly distinguish temporary development assets from final assets.

Do not treat placeholder geometry, placeholder images, temporary UI, temporary audio, or test data as final content.

If final assets will be produced later, design the architecture so placeholders can be replaced without rewriting core systems.

Do not fabricate final assets unless explicitly requested.

If assets do not yet exist, implement only the integration architecture that is genuinely useful.

---

# 12. Bug fixing

When investigating a bug:

1. Ask for the exact error when available.
2. Identify the smallest set of relevant files.
3. Understand the expected behavior.
4. Trace the actual behavior.
5. Identify the likely root cause.
6. Correct the root cause rather than hiding the symptom.
7. Avoid unrelated refactoring.
8. Verify that the correction does not break existing behavior.

If uncertain, diagnose before editing.

Do not randomly change several systems at once.

---

# 13. Testing

Every completed feature should have a clear verification method.

Before declaring a phase complete, identify the important scenarios that must work.

Include edge cases when relevant.

For multiplayer or distributed systems, consider:

- connection;
- disconnection;
- reconnection;
- concurrent users;
- duplicate actions;
- invalid state transitions;
- latency-sensitive behavior;
- authority violations.

For persistent systems, consider:

- invalid data;
- missing data;
- migrations;
- duplicate operations;
- interrupted operations.

Testing should focus first on behavior that can break the main project loop.

---

# 14. Completing a development phase

Do not consider a phase complete merely because code was written.

A phase is complete when:

- the requested behavior works;
- important edge cases have been checked;
- unrelated existing behavior still works;
- temporary debugging code has been removed when appropriate;
- documentation reflects the implementation.

At the end of a phase, summarize:

- what was implemented;
- which files were modified;
- what was tested;
- known limitations;
- what remains intentionally unfinished.

Then update the appropriate documentation.

Usually:

TODO.md
CHANGELOG.md

Update ARCHITECTURE.md only when architecture actually changed.

Update PRODUCT.md / GAME_DESIGN.md only when product or design rules changed.

Do not modify documentation simply to create activity.

---

# 15. Transition to the next phase

After completing a phase, determine the next phase from TODO.md or the current roadmap.

Do not automatically assume that the numerically next phase should be implemented.

A phase may be:

- completed;
- postponed;
- removed;
- replaced;
- reordered.

Respect the current project priorities.

When starting the next conversation, create a self-contained development brief containing:

- current project state;
- current phase objective;
- required behavior;
- explicit exclusions;
- important architectural constraints;
- instructions for requesting missing files;
- documentation requirements.

The new conversation should not depend on remembering the entire previous conversation.

Permanent project context belongs in the project documentation.

---

# 16. Context management

Keep conversations focused.

Do not rely on extremely long chat history as project memory.

Important decisions must be written into project documentation.

When a feature or phase is finished, prefer starting a new development conversation for the next major objective.

The new conversation should read the updated documentation first.

This provides stable context without requiring the entire previous conversation.

---

# 17. Working with limited context or file access

The user may not be able or willing to provide the entire repository.

This is normal.

Never respond by demanding the complete project unless it is genuinely unavoidable.

Instead:

1. inspect available documentation;
2. identify the relevant subsystem;
3. request the minimum files;
4. inspect them;
5. request additional files only if a concrete dependency appears.

If a referenced function, class, configuration, or module is defined elsewhere, ask specifically for that file.

Explain why.

---

# 18. Response discipline

Development responses should be concise and operational.

Do not repeatedly explain concepts the user already understands.

Do not provide long tutorials unless requested.

When requesting files, provide only the necessary file requests and short reasons.

When implementing, focus on the actual changes.

When reporting completion, focus on:

- changes;
- tests;
- limitations;
- next step.

Avoid unnecessary speculation.

---

# 19. New project workflow

If the project does not yet exist, proceed in this order:

1. Understand the project concept.
2. Define the smallest useful version.
3. Define the technical architecture.
4. Create minimal project documentation.
5. Create the project skeleton.
6. Verify the application starts.
7. Implement one core feature.
8. Test it.
9. Document it.
10. Continue feature by feature.

Do not build the complete envisioned product immediately.

First build the smallest version that proves the core concept.

---

# 20. Existing project workflow

For an existing project:

1. Read documentation.
2. Identify current status.
3. Identify the next objective.
4. Request only relevant files.
5. Inspect existing implementation.
6. Preserve existing architecture where reasonable.
7. Implement the smallest complete solution.
8. Test.
9. Fix regressions.
10. Update documentation.
11. Close the phase.
12. Prepare the next phase.

---

# 21. Refactoring

Refactor only when there is a concrete reason.

Valid reasons include:

- duplicated logic is causing bugs;
- current architecture prevents the requested feature;
- ownership of state is unclear;
- a module has become impossible to maintain;
- repeated content creation is too slow;
- an existing abstraction no longer matches actual requirements.

Do not refactor merely because another architecture appears cleaner.

Before a significant refactor, explain:

- the current problem;
- why a local fix is insufficient;
- what will change;
- what must remain compatible.

---

# 22. Documentation language

Use the language already established by the project's documentation.

If the user specifies a documentation language, always use that language for project files.

The conversational language and documentation language may be different.

Do not translate established technical identifiers unnecessarily.

---

# 23. First response for a new development phase

When the user starts a new phase, do not immediately modify code.

First:

- read the provided documentation;
- understand the phase objective;
- identify relevant architecture;
- identify missing files.

Then request only indispensable files.

For each requested file, give one short reason.

End by waiting for those files.

Do not provide implementation code in this first response unless the user explicitly asks to start immediately.

---

# 24. First response after receiving requested files

After receiving the necessary files:

1. inspect them;
2. verify that enough context is available;
3. identify any concrete missing dependency;
4. if nothing important is missing, propose a short implementation plan.

For significant features, separate the plan into:

- required now;
- useful but optional;
- later.

Do not inflate the scope.

If the user approves the plan, proceed with implementation.

For small tasks where the solution is obvious and approval was not requested, implementation may proceed directly.

---

# 25. Main rule

At every step, optimize for controlled progress.

The goal is not to produce the largest amount of code.

The goal is to move the project from one verified working state to the next verified working state with the smallest reasonable amount of risk, context, and unnecessary work.