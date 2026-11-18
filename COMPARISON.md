# KITE Protocol next to other ways of letting an AI build an interface

Many projects now let a model produce an interface instead of a paragraph. They are not all the same kind of thing, and most of them are not competitors of each other. This page says what each one is, where KITE differs, and how they fit together.

**How this was written.** Facts about other projects come from their own repositories, specifications and documentation, read on 2026-11-18. Sources are listed at the end. Where only a secondary source was found, or only part of a document was read, the text says so. Star counts and versions are as of that date and will age. Nothing here was measured by us unless it says so; in particular, **we have not benchmarked token use or output quality across formats**. Corrections are welcome.

## The layers

The projects sit on different layers. Comparing across layers is the usual source of confusion.

| Layer | The question it answers | Projects |
|---|---|---|
| **Transport** | How do an agent and an app exchange events? | AG-UI, MCP, A2A |
| **UI description** | What does the model write so that an interface appears? | **KITE Protocol**, A2UI, json-render specs, OpenUI Lang, Open-JSON-UI |
| **Host card formats** | What structured message will this particular host draw? | Adaptive Cards, Slack Block Kit, ChatKit widgets |
| **Shipped UI** | How does a tool bring its own ready-made interface? | MCP Apps |
| **App frameworks** | How do I build a product with an agent in it? | CopilotKit, Vercel AI SDK, Tambo, assistant-ui |

KITE Protocol is a UI description. It travels over a transport: its own line session, MCP, or AG-UI ([SPEC.md, section 10](SPEC.md#10-bindings)).

## At a glance

| | What the model writes | Vocabulary | Who lays it out | What lives between turns | How the user answers |
|---|---|---|---|---|---|
| **KITE Protocol** 0.3 | One edit per text line (`set k1 text ...`) | 16 card types that each mean something (`decision`, `timeline`, `route`), plus kinds a renderer adds | The renderer | One board, which the model reads back in the same language before each edit | `decision` and `input` cards; the answer returns as an op |
| **A2UI** v1.0 | JSON messages (`createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface`) | A catalog the app chooses; the basic one has 18 layout and input components | The writer (rows, columns, cards) | Surfaces and their data models | `action` messages from the renderer |
| **json-render** | A JSON tree (`root`, `elements`), streamed | A catalog the developer defines; a shadcn/ui set of 36 is provided | The writer | The spec that was generated; state inside it | Actions the catalog declares |
| **OpenUI Lang** | A compact DSL for a component tree | Component libraries for React, Vue, Svelte, Angular | The writer | The generated tree | Component callbacks |
| **Open-JSON-UI** | JSON components with properties, children, style | Not confirmed from a primary source | The writer | Not confirmed | Not confirmed |
| **Adaptive Cards** 1.6 | One JSON card | Fixed schema: text, images, containers, inputs, actions | The writer, within the card | Nothing; a card is a message | `Action.Submit` and other actions |
| **Slack Block Kit** | A JSON array of blocks | Fixed block types | Top to bottom, in order | Nothing; a message can be updated by the app | Interactive elements post back to the app |
| **ChatKit widgets** | JSON widgets (`Card`, `ListView`) | Fixed component set | The writer, within the widget | Nothing; a widget is part of a chat message | Widget actions |
| **MCP Apps** | Nothing at run time: the tool's author ships HTML | Anything HTML can do | The author | Whatever the page keeps | The page itself, in a sandboxed frame |
| **AG-UI** 1.0 | Not a UI format | Not its concern | Not its concern | Shared state (`STATE_SNAPSHOT`, `STATE_DELTA`) | Frontend tools, interrupts |

## What is different about KITE

**It edits a board that stays.** In the other UI descriptions, the unit of work is an interface produced for an answer: a surface, a spec, a card in a message. In KITE the unit is a workspace that outlives the answer. A model changes one field or one item of a card that is already there, and a topic that comes back next week is continued on its old cards. Chat-hosted formats (Adaptive Cards, Block Kit, ChatKit widgets) are messages in a transcript by design; KITE has no transcript.

**The model reads the screen in the language it writes.** The board is given back as the ops that would rebuild it, so the writer needs no memory of what it drew and no second format to learn. A2UI and json-render keep surface or spec state on the client; how the model is shown the current interface is left to the application.

**Lines, not a document.** One op is one line of plain text, applied when the line ends. There is no bracket to balance and no partial document to repair mid-stream, and a wrong line is rejected with a code while the next line still runs. JSON formats stream too (A2UI as JSONL messages, json-render as patches), with the cost that every message must be valid JSON. OpenUI Lang makes the same bet against JSON as KITE does, for a different shape of output: a component tree rather than edits.

**Cards carry meaning; layout is not the writer's.** A KITE writer says "this is a decision with these options", never "a column holding a row holding two buttons". Where the card goes, how large it gets, and what is folded away when a topic is crowded are the renderer's work. This is the largest difference from A2UI, json-render and OpenUI, where the writer composes layout from primitives. It is also the largest limitation: see below.

**Asking the user is part of the language.** A `decision` or `input` card waits for the user, the renderer brings such cards forward one at a time, and the answer returns as an op (`user set k2 chosen o2`) in the same stream as everything else. Elsewhere this is an action callback into application code.

**The user's hand outranks the writer's.** A card the user moved or resized is pinned, and an agent's attempt to move it is rejected by the protocol itself. We found no equivalent rule in the other descriptions.

## What KITE does not do

Stated plainly, because the trade above has a price.

- **No free layout.** A writer cannot build an arbitrary screen: a login form, a landing page, a custom dashboard arrangement. A2UI, json-render and OpenUI can.
- **A small vocabulary.** 16 card types. A renderer can add kinds of its own (`x-...`), which fall back to a generic `record` card elsewhere, and a writer can use `record` for any entity with named fields. That is still far from the open component catalogs of the others: an extension kind has no declared schema or look in the protocol.
- **No data binding.** There is no data model with paths, no computed values, no conditional visibility. KITE has only named values (`let`), which substitute text. A2UI and json-render have real binding.
- **Short text only.** Cells hold 60 characters. That is the point of the design. Long content is pointed at with a `doc` card and opened outside the board; it is never on it.
- **One renderer family.** KITE for desktop and Android, from one author. A2UI has official renderers for Lit, Angular, React, Flutter and SwiftUI; json-render for React, Vue, Svelte, Solid, React Native and more.
- **Young.** Version 0.3, one production user, no measurements published. A2UI and AG-UI are at 1.0 with many integrations.

If you need an agent to draw arbitrary interfaces inside your own product, use A2UI or json-render. If you want an agent's work to live on a board a person can keep, KITE is built for that.

## Project by project

### A2UI (Google)

A declarative UI protocol with renderers: the agent sends JSON messages and the client draws native components from a catalog it trusts. Version 1.0 is the current specification; Apache-2.0; about 17.6k stars. Components form a flat list linked by id, with exactly one `root` per surface; data lives in a per-surface model addressed by JSON Pointer; custom catalogs are JSON Schema documents the renderer advertises. Transports named by the spec include A2A, AG-UI, MCP, SSE and WebSockets.

*Next to KITE:* the same layer, a different unit. A2UI describes a surface component by component, including its layout; KITE edits a board card by card and leaves layout out. In the part of the specification we read, whole surfaces are removed with `deleteSurface` and we did not find a message that removes a single component; KITE's `del` removes one item or one card. *Together:* A2UI's catalogs are open, so KITE's card types could be offered as an A2UI catalog. That mapping is not specified yet.

### json-render (Vercel Labs)

A library, not a wire protocol: you define a catalog of components and actions, the model emits a JSON spec constrained to it, and the library renders it with your components. Apache-2.0; about 19.8k stars; renderers for React, Vue, Svelte, Solid, React Native, and targets such as PDF, email and terminal. Specs have a flat `elements` map and a `root`; state is bound with `$state` and `$bindState`; streaming is handled by a spec stream compiler.

*Next to KITE:* the idea of constraining a model to a catalog is shared (KITE's card type table plays that role). json-render generates an interface for a prompt inside a developer's app; it has no board, no topics, no read-back and no notion of a card waiting for the user, all of which it leaves to the app. *Together:* a web renderer for KITE could be built on json-render by defining the card types as a catalog.

### OpenUI Lang (Thesys)

A compact, streaming language for model-generated component trees, with runtimes for React, Vue, Svelte and Angular; MIT. Its authors report roughly half the output tokens of JSON formats in their own benchmark of seven screens; an independent write-up notes the JSON in that benchmark was not model-written.

*Next to KITE:* the closest relative in spirit, since both reject JSON as what a model should write. OpenUI Lang describes a tree for one response; KITE describes edits to a persistent board.

### Open-JSON-UI

Described in CopilotKit's and AG-UI's documentation as an open standardization of OpenAI's internal declarative UI schema: JSON components with properties, children and style. We found no primary specification or repository from OpenAI, so it appears in the table with gaps.

### Adaptive Cards (Microsoft), Slack Block Kit, ChatKit widgets (OpenAI)

Card formats owned by a host. Adaptive Cards is a JSON schema (up to 1.6; what renders depends on the host, and Teams stops at 1.5 according to Microsoft's guidance) drawn natively by Teams, Outlook and Copilot. Block Kit is an array of blocks, up to 50 in a message. ChatKit widgets are JSON widgets with `Card` and `ListView` roots for OpenAI's embeddable chat.

*Next to KITE:* these are rich messages inside a conversation, and each is tied to its host. They are mature, widely deployed, and the right choice when the user already lives in that host. KITE is a place of its own with no conversation to scroll. *Together:* a KITE card could be exported to any of them as a snapshot; the reverse loses nothing but layout.

### MCP Apps

The official MCP extension for interfaces (specification 2026-01-26, stable; Apache-2.0): a tool declares a `ui://` resource holding HTML, and the host renders it in a sandboxed frame that can talk back to the host. Supported by ChatGPT, Claude, VS Code and others, to varying degrees.

*Next to KITE:* a different problem. In MCP Apps the interface is written ahead of time by the tool's author and delivered whole; the model chooses when to show it but does not compose it. In KITE the model composes the screen at run time from a small vocabulary and nothing executes. *Together:* they complement each other. A KITE `web` card can already show a page; showing an MCP App inside a card would be a natural extension.

### AG-UI (CopilotKit)

An event protocol between an agent backend and a frontend: version 1.0, 31 event types in eight families (runs, text, tool calls, state, reasoning, activity, subagents, passthrough), MIT, about 20k stars, with integrations for LangGraph, CrewAI, Pydantic AI, Google ADK, Microsoft Agent Framework and others. Its documentation states that it "is not a generative UI specification" and that it carries A2UI, Open-JSON-UI and MCP-UI.

*Next to KITE:* not an alternative but a road. KITE defines an AG-UI binding ([SPEC.md, section 10.5](SPEC.md#105-ag-ui)): a KITE renderer is an AG-UI client that sends the board and a `screen` tool with each run, and an AG-UI agent drives the board with text, tool calls or `CUSTOM` events.

### App frameworks

CopilotKit (the maker of AG-UI), Vercel AI SDK, Tambo and assistant-ui are frameworks for building a product with an agent in it. Their generative UI is mostly a model choosing among components the developer registered and filling in props, shown inside a chat. Vercel's original `streamUI` over React Server Components is marked experimental with development paused; its documentation points to rendering typed tool results in AI SDK UI instead.

*Next to KITE:* these are toolkits for developers; KITE is a protocol and a finished app. A product built with any of them could embed a KITE renderer as its workspace.

## Choosing

| You want | Look at |
|---|---|
| An agent's ongoing work on one board a person keeps, with decisions that come to them | KITE Protocol |
| An agent drawing arbitrary native interfaces across web and mobile | A2UI |
| A model generating UI from your own React, Vue or Svelte components | json-render, OpenUI, Tambo |
| Rich replies inside Teams, Slack or ChatGPT | Adaptive Cards, Block Kit, ChatKit widgets |
| A tool that brings its own ready-made interface to any MCP host | MCP Apps |
| To connect an agent framework to a frontend | AG-UI |

These combine. A plausible stack: an agent built with LangGraph, speaking AG-UI, writing KITE ops to a board, on which one card shows an MCP App.

## Sources

Read on 2026-11-18.

- A2UI: [repository](https://github.com/google/A2UI), [specification v1.0](https://a2ui.org/specification/v1.0-a2ui/) (the first 100,000 of about 117,000 characters were read)
- json-render: [repository](https://github.com/vercel-labs/json-render)
- AG-UI: [repository](https://github.com/ag-ui-protocol/ag-ui), [events](https://docs.ag-ui.com/concepts/events), [types](https://docs.ag-ui.com/sdk/js/core/types), [generative UI specs](https://docs.ag-ui.com/concepts/generative-ui-specs)
- MCP Apps: [repository](https://github.com/modelcontextprotocol/ext-apps), [SEP-1865](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp)
- OpenUI: [repository README](https://cdn.jsdelivr.net/gh/thesysdev/openui@main/README.md), and an [independent note on its benchmark](https://mer.vin/2026/05/openui-lang-mit-generative-ui-that-cuts-llm-output-tokens-versus-json/) (via search summaries; the pages themselves were not read in full)
- Open-JSON-UI: [CopilotKit documentation](https://docs.copilotkit.ai/generative-ui-specs/open-json-ui) (secondary; via search summary)
- Adaptive Cards: [schema explorer](https://www.adaptivecards.io/explorer), [Microsoft guidance](https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/adaptive-cards-overview) (via search summaries)
- Slack Block Kit: [documentation](https://docs.slack.dev/block-kit/) (via search summary)
- ChatKit widgets: [OpenAI guide](https://developers.openai.com/api/docs/guides/chatkit-widgets) (via search summary)
- Vercel AI SDK RSC: [reference](https://v5.ai-sdk.dev/docs/reference/ai-sdk-rsc) (via search summary)
- The field as a whole: [awesome-generative-ui](https://github.com/narrowin/awesome-generative-ui)
