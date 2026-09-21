window.__ModuleLoader__.load({ id: "dsh-task-dispatch-table", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");

// src/client/locales.ts
var zh = {
  summary: "\u5468\u671F\u4EFB\u52A1\u5B9A\u4E49\u8868\u4E0E\u8C03\u5EA6\u53C2\u6570",
  title: "\u4EFB\u52A1\u8C03\u5EA6\u8868\uFF08dsh-task-dispatch-table\uFF09",
  description: "\u5728\u4E0B\u65B9\u7F16\u8F91\u5185\u5D4C\u4EFB\u52A1\u8868 JSON\uFF1B\u4FDD\u5B58\u540E\u5199\u5165\u7528\u6237\u914D\u7F6E\u5C42\u5E76\u5373\u65F6\u751F\u6548\uFF0C\u79BB\u5F00\u9875\u9762\u4E22\u5F03\u672A\u4FDD\u5B58\u7684\u8349\u7A3F\u3002",
  unavailable: "\u8BBE\u7F6E\u547D\u540D\u7A7A\u95F4\u5F53\u524D\u4E0D\u53EF\u7528\uFF08\u63D2\u4EF6\u672A\u8FD0\u884C\u6216\u5BBF\u4E3B\u672A\u63D0\u4F9B\uFF09\uFF0C\u6682\u65F6\u65E0\u6CD5\u914D\u7F6E\u3002",
  tasksInlineLabel: "\u4EFB\u52A1\u8868\uFF08tasksInline\uFF0CJSON \u6570\u7EC4\uFF09",
  tasksInlineHint: "\u6BCF\u9879\u4E00\u4E2A\u4EFB\u52A1\u5B9A\u4E49\uFF1B\u975E\u7A7A\u65F6\u4F18\u5148\u4E8E\u4EFB\u52A1\u76EE\u5F55 tasksDir\u3002\u6E05\u7A7A\u5E76\u4FDD\u5B58 = \u56DE\u5230\u9ED8\u8BA4\uFF08\u7A7A\uFF0C\u6539\u7528 tasksDir\uFF09\u3002",
  invalidJson: "\u4EFB\u52A1\u8868\u4E0D\u662F\u5408\u6CD5 JSON\uFF0C\u5DF2\u963B\u6B62\u4FDD\u5B58\uFF1B\u8BF7\u4FEE\u6B63\u540E\u91CD\u8BD5\u3002",
  save: "\u4FDD\u5B58",
  saving: "\u4FDD\u5B58\u4E2D\u2026",
  saveFailed: "\u4FDD\u5B58\u672A\u751F\u6548\uFF1A\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u4FEE\u6539\u540E\u91CD\u8BD5\uFF08\u5BBF\u4E3B\u53EF\u80FD\u62D2\u7EDD\u4E86\u90E8\u5206\u503C\u6216\u5DF2\u6709\u5E76\u53D1\u4FEE\u6539\uFF09\u3002",
  discard: "\u653E\u5F03\u66F4\u6539",
  paramsTitle: "\u8FD0\u884C\u53C2\u6570\uFF08\u53EA\u8BFB\uFF09",
  paramDefault: "\uFF08\u9ED8\u8BA4\uFF09",
  paramStatePath: "\u72B6\u6001\u5E93\u8DEF\u5F84 statePath",
  paramTickMs: "\u8C03\u5EA6\u5468\u671F tickMs\uFF08\u6BEB\u79D2\uFF09",
  paramDispatchGraceMs: "\u6D3E\u53D1\u5BBD\u9650 dispatchGraceMs\uFF08\u6BEB\u79D2\uFF09",
  paramLeaseMs: "\u8FD0\u884C\u79DF\u7EA6 leaseMs\uFF08\u6BEB\u79D2\uFF09",
  paramUnknownGraceMs: "\u89C2\u5BDF\u5BBD\u9650 unknownGraceMs\uFF08\u6BEB\u79D2\uFF09",
  paramTasksDir: "\u4EFB\u52A1\u76EE\u5F55 tasksDir"
};
var en = {
  summary: "Periodic task definitions and scheduler parameters",
  title: "Task dispatch table (dsh-task-dispatch-table)",
  description: "Edit the inline task-table JSON below; saving writes the user settings layer and takes effect immediately. Unsaved drafts are dropped when you leave the page.",
  unavailable: "The settings namespace is currently unavailable (plugin not running or not served by the host); configuration is disabled.",
  tasksInlineLabel: "Task table (tasksInline, JSON array)",
  tasksInlineHint: "One task definition per entry; when non-empty it takes precedence over tasksDir. Clear and save to fall back to the default (empty, use tasksDir).",
  invalidJson: "The task table is not valid JSON; the save was blocked. Fix it and try again.",
  save: "Save",
  saving: "Saving\u2026",
  saveFailed: "The save did not land; your draft was kept for correction (the host may have rejected values or applied concurrent changes).",
  discard: "Discard changes",
  paramsTitle: "Runtime parameters (read-only)",
  paramDefault: "(default)",
  paramStatePath: "State database path statePath",
  paramTickMs: "Tick interval tickMs (ms)",
  paramDispatchGraceMs: "Dispatch grace dispatchGraceMs (ms)",
  paramLeaseMs: "Run lease leaseMs (ms)",
  paramUnknownGraceMs: "Observation grace unknownGraceMs (ms)",
  paramTasksDir: "Task directory tasksDir"
};

// src/client/index.ts
var SETTINGS_NS = "dsh-task-dispatch-table";
var LOCALE_NS = SETTINGS_NS;
var BUNDLE_KEY = SETTINGS_NS;
var inject = ["slots", "locale", "settingsScope"];
function displayParam(t, value) {
  if (value === void 0) return "\u2014";
  if (typeof value === "string" && value.trim() === "") return t("paramDefault");
  return String(value);
}
var textareaStyle = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: "16em",
  resize: "vertical",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: "12px",
  lineHeight: 1.5,
  padding: "8px"
};
var hintStyle = { opacity: 0.7, fontSize: "12px", margin: "4px 0 8px" };
var errorStyle = { color: "#c0392b", fontSize: "12px", margin: "4px 0 0" };
var rowStyle = { display: "flex", gap: "8px", margin: "8px 0" };
var dlStyle = { display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px", margin: "8px 0 0" };
function TasksConfigPage(props) {
  const { t } = props;
  const state = props.useTasksConfig((s) => s);
  if (props.view === "summary") return (0, import_react.createElement)("span", null, t("summary"));
  if (!state.available) return (0, import_react.createElement)("p", null, t("unavailable"));
  return (0, import_react.createElement)(
    "div",
    null,
    (0, import_react.createElement)("h3", null, t("title")),
    (0, import_react.createElement)("p", { style: hintStyle }, t("description")),
    (0, import_react.createElement)("label", { htmlFor: "dsh-tdt-tasks-inline", style: { fontWeight: 600 } }, t("tasksInlineLabel")),
    (0, import_react.createElement)("p", { style: hintStyle }, t("tasksInlineHint")),
    (0, import_react.createElement)("textarea", {
      id: "dsh-tdt-tasks-inline",
      value: state.draft,
      disabled: !state.writable || state.saving,
      onChange: (event) => {
        props.edit(event.target.value);
      },
      spellCheck: false,
      style: textareaStyle
    }),
    state.invalid ? (0, import_react.createElement)("p", { style: errorStyle }, t("invalidJson")) : null,
    (0, import_react.createElement)(
      "div",
      { style: rowStyle },
      (0, import_react.createElement)("button", {
        type: "button",
        onClick: () => {
          props.save();
        },
        disabled: !state.writable || state.saving || state.invalid
      }, state.saving ? t("saving") : t("save")),
      (0, import_react.createElement)("button", {
        type: "button",
        onClick: () => {
          props.discard();
        },
        disabled: state.saving || !state.dirty
      }, t("discard"))
    ),
    state.failed ? (0, import_react.createElement)("p", { style: errorStyle }, t("saveFailed")) : null,
    (0, import_react.createElement)(
      "details",
      { style: { marginTop: "16px" } },
      (0, import_react.createElement)("summary", null, t("paramsTitle")),
      (0, import_react.createElement)(
        "dl",
        { style: dlStyle },
        (0, import_react.createElement)("dt", null, t("paramStatePath")),
        (0, import_react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, state.values.statePath)),
        (0, import_react.createElement)("dt", null, t("paramTickMs")),
        (0, import_react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, state.values.tickMs)),
        (0, import_react.createElement)("dt", null, t("paramDispatchGraceMs")),
        (0, import_react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, state.values.dispatchGraceMs)),
        (0, import_react.createElement)("dt", null, t("paramLeaseMs")),
        (0, import_react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, state.values.leaseMs)),
        (0, import_react.createElement)("dt", null, t("paramUnknownGraceMs")),
        (0, import_react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, state.values.unknownGraceMs)),
        (0, import_react.createElement)("dt", null, t("paramTasksDir")),
        (0, import_react.createElement)("dd", { style: { margin: 0 } }, displayParam(t, state.values.tasksDir))
      )
    )
  );
}
function isValidTaskTable(text) {
  if (text.trim() === "") return true;
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
}
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), "dsh-task-dispatch-table: \u9875\u9762\u5B57\u5178");
  const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NS });
  let staged;
  let saving = false;
  let failed = false;
  const effectiveInline = () => {
    const value = scope.getSnapshot().value?.["tasksInline"];
    return typeof value === "string" ? value : "";
  };
  const publish = () => {
    store.set(buildState());
  };
  const buildState = () => {
    const snapshot = scope.getSnapshot();
    const value = snapshot.value;
    const invalid = staged !== void 0 && !isValidTaskTable(staged);
    return {
      available: snapshot.status === "ready",
      writable: snapshot.writable,
      dirty: staged !== void 0,
      invalid,
      saving,
      failed,
      draft: staged ?? effectiveInline(),
      overridden: snapshot.user !== void 0 && Object.hasOwn(snapshot.user, "tasksInline"),
      values: {
        statePath: typeof value?.["statePath"] === "string" ? value["statePath"] : void 0,
        tickMs: typeof value?.["tickMs"] === "number" ? value["tickMs"] : void 0,
        dispatchGraceMs: typeof value?.["dispatchGraceMs"] === "number" ? value["dispatchGraceMs"] : void 0,
        leaseMs: typeof value?.["leaseMs"] === "number" ? value["leaseMs"] : void 0,
        unknownGraceMs: typeof value?.["unknownGraceMs"] === "number" ? value["unknownGraceMs"] : void 0,
        tasksDir: typeof value?.["tasksDir"] === "string" ? value["tasksDir"] : void 0
      }
    };
  };
  const store = (() => {
    let state = buildState();
    const listeners = /* @__PURE__ */ new Set();
    return {
      getSnapshot: () => state,
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      set(next) {
        state = next;
        for (const listener of [...listeners]) listener();
      }
    };
  })();
  scope.subscribe(publish);
  const actions = {
    edit(text) {
      staged = text;
      failed = false;
      publish();
    },
    save() {
      void saveNow();
    },
    discard() {
      if (staged === void 0 && !failed) return;
      staged = void 0;
      failed = false;
      publish();
    }
  };
  async function saveNow() {
    const snapshot = scope.getSnapshot();
    if (saving || snapshot.status !== "ready" || !snapshot.writable) return;
    const text = staged;
    if (text === void 0) return;
    if (!isValidTaskTable(text)) {
      publish();
      return;
    }
    saving = true;
    failed = false;
    publish();
    let landed;
    if (text.trim() === "") {
      await scope.unset("tasksInline");
      const user = scope.getSnapshot().user;
      landed = !(user !== void 0 && Object.hasOwn(user, "tasksInline"));
    } else {
      await scope.set("tasksInline", text);
      const user = scope.getSnapshot().user;
      landed = user !== void 0 && user["tasksInline"] === text;
    }
    if (landed) staged = void 0;
    saving = false;
    failed = !landed;
    publish();
  }
  const describeFace = ctx.settingsScope.describe();
  ctx.effect(() => {
    let off;
    const sync = () => {
      const namespaces = describeFace.getSnapshot().view?.namespaces;
      const served = namespaces?.some((view) => view.ns === SETTINGS_NS) ?? false;
      if (served && off === void 0) {
        off = ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
          name: "plugins.bundle.config",
          key: BUNDLE_KEY,
          locale: LOCALE_NS,
          inject: () => ({ hooks: { tasksConfig: store }, ...actions })
        }, TasksConfigPage));
      } else if (!served && off !== void 0) {
        off();
        off = void 0;
      }
    };
    const unsubscribe = describeFace.subscribe(sync);
    void describeFace.ensure();
    sync();
    return () => {
      unsubscribe();
      if (off !== void 0) {
        off();
        off = void 0;
      }
    };
  }, "dsh-task-dispatch-table: \u914D\u7F6E\u9875\u6CE8\u518C");
}
;return module.exports; } });
