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
8  Camera Spin (not implemented)
9  Overlay: Show / Hide
0  Render: GPU / CPU
--------------
Controls:
Drag mouse / Arrow keys
Wheel / + / - zoom`;

export type HintPanelController = {
    setOverlayVisible: (visible: boolean) => void;
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
