# Workbench Guidelines

The workbench is a React 19 + Vite 8 + Tailwind v4 app. Its UI kit in
`src/components/ui` holds shadcn/ui components on Radix, copied in by hand:
there is no `components.json`, so the shadcn CLI can't read the project. Build
and lint commands live in the root `AGENTS.md`.

## Skills

Load the skill that matches the task before you start:

- **`frontend-design`**: new screens, layout or visual changes.
- **`shadcn`**: adding, styling or composing `src/components/ui` parts. Follow its
  styling rules (semantic color tokens, `cn()`, `gap-*` over `space-*`). Skip its
  CLI steps and copy component source by hand.
- **`vercel-react-best-practices`**: writing, reviewing or refactoring components,
  and bundle size. Skip the Next.js and server-side rules; this is a client-only SPA.
- **`vite`**: changes to `vite.config.ts`, the dev proxy, or the build pipeline.
- **`web-design-guidelines`**: reviewing UI for accessibility and UX.
- **`prototype`**: trying out a UI or state idea before you build it for real.

If one of these isn't installed, run from the repo root:

```sh
npx -y skills@latest add vercel-labs/agent-skills --skill vercel-react-best-practices
npx -y skills@latest add vercel-labs/agent-skills --skill web-design-guidelines
npx -y skills@latest add shadcn-ui/ui --skill shadcn
npx -y skills@latest add antfu/skills --skill vite
```
