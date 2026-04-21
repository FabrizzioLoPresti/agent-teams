# PASOS

1. Installar Claude Code
2. Correr comando `claude init` para inicializar Claudio y su `CLAUDE.md` con el resumen del proyecto
3. Instalar [Spec-Kit](https://github.com/github/spec-kit)
4. Inicializar Specify con `specify init .` y seleccionar Claude Code, OpenCode, etc. para instalar skills
5. Para crear Skills propias recomendable instalar la Skill de [Skill Creator](https://skills.sh/anthropics/skills/skill-creator) de Anthropic
6. Definir dentro de `.claude/rules/` las reglas a seguir durante la implementacion de Features, por ejemplo como debe ser la estructura de carpetas para la creación de archivos, orden de los `imports` de dependencias, stack tecnológico (definir reglas para que utilice ciertas estructuras de código)
7. Definir una carpeta `/docs` de documentación que contenga información sobre el proyecto que pueda resultar util a la IA ya los devs conteniendo por ejemplo arquitectura, decisiones, runbooks (para explicar como realizar migración de base de datos para actualizar schemas, etc.)
8. Crear los Agentes encargados de utilizar las Skills de Spec-Kit:
    - speckit-architecture-designer
    - speckit-clasification-agent
    - speckit-consistency-analyzer
    - speckit-implementer
    - speckit-requirements-analyst
    - speckit-review-validator
    - speckit-task-planner
9. Actualizar `CLAUDE.md` para definir dentro del mismo que Agentes existen en el proyecto y asociar a los mismos las Skills de Spec-kit y las Skills propias, además de definir reglas que debe aplicar siempre `Claude Code` como que el Agente Principal siempre debe actuar como `Orquestador` delegando las tareas a los demás `Subagentes`
10. Activar `Agent Teams` para `Claude Code`
11. En caso de querer tener una memoria mas rápida para evitar exceso de Markdowns utilizar [Engram](https://github.com/Gentleman-Programming/engram), la cual es una base de datos con SQLite + FTS5, MCP server, HTTP API, CLI, and TUI.
    - En ese caso agregar MCP