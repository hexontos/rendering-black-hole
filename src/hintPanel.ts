const HINT_PANEL_STYLE_ID = "blackhole-hint-panel-style";

const INITIAL_EXPANDED_DURATION_MS = 3000;

const ensureHintPanelStyles = (): void => {
    if (document.getElementById(HINT_PANEL_STYLE_ID) != null) return;

    const style = document.createElement("style");
    style.id = HINT_PANEL_STYLE_ID;
    style.textContent = `
.blackhole-hint-panel {
    position: fixed;
    display: inline-flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    width: max-content;
    min-width: 22px;
    max-width: 22px;
    max-height: 22px;
    overflow: hidden;
    padding: 5px 7px;
    border-radius: 12px;
    border: 2px solid rgba(255, 255, 255, 0.18);
    background: rgba(0, 0, 0, 0.28);
    color: rgba(224, 224, 224, 0.86);
    font-family: monospace;
    font-size: 12px;
    line-height: 1.45;
    white-space: pre;
    transform-origin: top left;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(8px);
    z-index: 10000;
    transition:
        max-width 140ms ease,
        max-height 160ms ease,
        transform 140ms ease,
        background-color 140ms ease,
        border-color 140ms ease,
        box-shadow 140ms ease;
}

.blackhole-hint-panel.expanded {
    max-width: 420px;
    max-height: 320px;
    align-items: flex-start;
    transform: scale(1.02);
    background: rgba(0, 0, 0, 0.42);
    border-color: rgba(255, 255, 255, 0.32);
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.3);
}

.blackhole-hint-panel__label {
    color: rgba(242, 242, 242, 0.92);
    letter-spacing: 1px;
    width: 100%;
    text-align: center;
}

.blackhole-hint-panel.expanded .blackhole-hint-panel__label {
    text-align: left;
}

.blackhole-hint-panel__content {
    align-self: flex-start;
    opacity: 0;
    transform: translateY(-4px);
    transition: opacity 110ms ease, transform 110ms ease;
}

.blackhole-hint-panel.expanded .blackhole-hint-panel__content {
    opacity: 1;
    transform: translateY(0);
}

.blackhole-overlay-dialog-backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: transparent;
    opacity: 0;
    pointer-events: none;
    z-index: 10001;
    transition: opacity 140ms ease;
}

.blackhole-overlay-dialog-backdrop.visible {
    opacity: 1;
    pointer-events: auto;
}

.blackhole-overlay-dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: min(360px, calc(100vw - 32px));
    padding: 14px 16px;
    border-radius: 16px;
    border: 2px solid rgba(255, 255, 255, 0.18);
    background: rgba(0, 0, 0, 0.28);
    color: rgba(224, 224, 224, 0.86);
    font-family: monospace;
    font-size: 12px;
    line-height: 1.5;
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(8px);
}

.blackhole-overlay-dialog__title,
.blackhole-overlay-dialog__message {
    white-space: pre-wrap;
}

.blackhole-overlay-dialog__title {
    color: rgba(242, 242, 242, 0.92);
}

.blackhole-overlay-dialog__actions {
    display: flex;
    gap: 8px;
}

.blackhole-overlay-dialog__button {
    min-width: 72px;
    padding: 6px 14px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.02);
    color: rgba(224, 224, 224, 0.86);
    font: inherit;
    cursor: pointer;
    transition:
        background-color 120ms ease,
        border-color 120ms ease,
        color 120ms ease,
        box-shadow 120ms ease;
}

.blackhole-overlay-dialog__button:hover,
.blackhole-overlay-dialog__button.selected {
    background: rgba(255, 255, 255, 0.14);
    border-color: rgba(255, 255, 255, 0.4);
    color: rgba(255, 255, 255, 1);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12);
}
`;

    document.head.appendChild(style);
};

const panelContent = `1  Canvas: Default / Fullscreen
2  Geodesic: Fast / Runge-Kutta
3  Geodesic: On / Off
4  BG: Milky Way / Stars / Empty
5  Grid: Show / Hide
6  Disc: Show / Hide
7  Spheres: Show / Hide
8  Camera Spin: Off / Right / Left
9  Overlay: Show / Hide
0  Render: GPU / CPU
--------------
Controls:
Drag mouse / Arrow keys
Wheel / + / - zoom`;

export type HintPanelController = {
    setOverlayVisible: (visible: boolean) => void;
};

type OverlayDialogAction = {
    label: string;
    onSelect: () => void;
};

type OverlayDialogOptions = {
    title: string;
    message?: string;
    actions: OverlayDialogAction[];
    initialActionIndex?: number;
};

export type OverlayDialogController = {
    close: () => void;
    handleKeyDown: (event: KeyboardEvent) => boolean;
    isOpen: () => boolean;
    open: (options: OverlayDialogOptions) => void;
};

type CreateHintPanelOptions = {
    expandInitially?: boolean;
};

export const createHintPanel = (anchor: HTMLElement, options: CreateHintPanelOptions = {}): HintPanelController => {
    ensureHintPanelStyles();

    const panel = document.createElement("div");
    panel.className = "blackhole-hint-panel";
    let overlayVisible = true;
    let hovered = false;
    let startupExpanded = options.expandInitially === true;
    if (startupExpanded) {
        panel.classList.add("expanded");
    }

    const label = document.createElement("div");
    label.className = "blackhole-hint-panel__label";
    label.textContent = "...";

    const content = document.createElement("div");
    content.className = "blackhole-hint-panel__content";
    content.textContent = panelContent;

    panel.append(label, content);

    const syncExpandedState = (): void => {
        panel.classList.toggle("expanded", hovered || startupExpanded);
        positionPanel();
    };

    const positionPanel = (): void => {
        if (!overlayVisible) {
            panel.style.left = "8px";
            panel.style.top = "8px";
            return;
        }

        const rect = anchor.getBoundingClientRect();
        panel.style.left = `${Math.round(rect.left)}px`;
        panel.style.top = `${Math.round(rect.bottom + 8)}px`;
    };

    panel.addEventListener("mouseenter", () => {
        hovered = true;
        syncExpandedState();
    });

    panel.addEventListener("mouseleave", () => {
        hovered = false;
        syncExpandedState();
    });

    window.addEventListener("resize", positionPanel);

    document.body.appendChild(panel);
    requestAnimationFrame(syncExpandedState);

    if (startupExpanded) {
        window.setTimeout(() => {
            startupExpanded = false;
            syncExpandedState();
        }, INITIAL_EXPANDED_DURATION_MS);
    }

    return {
        setOverlayVisible: (visible: boolean) => {
            overlayVisible = visible;
            positionPanel();
        },
    };
};

export const createOverlayDialog = (): OverlayDialogController => {
    ensureHintPanelStyles();

    const backdrop = document.createElement("div");
    backdrop.className = "blackhole-overlay-dialog-backdrop";

    const dialog = document.createElement("div");
    dialog.className = "blackhole-overlay-dialog";

    const title = document.createElement("div");
    title.className = "blackhole-overlay-dialog__title";

    const message = document.createElement("div");
    message.className = "blackhole-overlay-dialog__message";

    const actions = document.createElement("div");
    actions.className = "blackhole-overlay-dialog__actions";

    dialog.append(title, message, actions);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    let activeOptions: OverlayDialogOptions | null = null;
    let selectedActionIndex = 0;

    const syncSelectedAction = (): void => {
        const buttons = actions.querySelectorAll<HTMLButtonElement>(".blackhole-overlay-dialog__button");
        buttons.forEach((button, index) => {
            button.classList.toggle("selected", index === selectedActionIndex);
        });
    };

    const close = (): void => {
        activeOptions = null;
        backdrop.classList.remove("visible");
    };

    const executeSelectedAction = (): void => {
        if (activeOptions == null) return;
        const action = activeOptions.actions[selectedActionIndex];
        action?.onSelect();
    };

    const renderActions = (): void => {
        actions.replaceChildren();

        if (activeOptions == null) return;

        activeOptions.actions.forEach((action, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "blackhole-overlay-dialog__button";
            button.textContent = action.label;
            button.addEventListener("mouseenter", () => {
                selectedActionIndex = index;
                syncSelectedAction();
            });
            button.addEventListener("click", (event) => {
                event.preventDefault();
                action.onSelect();
            });
            actions.appendChild(button);
        });

        syncSelectedAction();
    };

    return {
        close,
        handleKeyDown: (event: KeyboardEvent): boolean => {
            if (activeOptions == null) return false;

            const actionCount = activeOptions.actions.length;
            if (actionCount === 0) return false;

            if (event.key === "ArrowLeft" || event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
                selectedActionIndex = (selectedActionIndex + actionCount - 1) % actionCount;
                syncSelectedAction();
                event.preventDefault();
                return true;
            }

            if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "Tab") {
                selectedActionIndex = (selectedActionIndex + 1) % actionCount;
                syncSelectedAction();
                event.preventDefault();
                return true;
            }

            if (event.key === "Enter" || event.key === " ") {
                executeSelectedAction();
                event.preventDefault();
                return true;
            }

            if (event.key === "Escape") {
                close();
                event.preventDefault();
                return true;
            }

            return false;
        },
        isOpen: () => activeOptions != null,
        open: (options: OverlayDialogOptions) => {
            const actionsLength = options.actions.length;
            if (actionsLength === 0) return;

            activeOptions = options;
            title.textContent = options.title;
            message.textContent = options.message ?? "";
            message.style.display = options.message == null || options.message.length === 0 ? "none" : "block";
            selectedActionIndex = Math.max(0, Math.min(options.initialActionIndex ?? 0, actionsLength - 1));
            renderActions();
            backdrop.classList.add("visible");
        },
    };
};
