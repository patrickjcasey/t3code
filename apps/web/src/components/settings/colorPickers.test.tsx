import { act, type ReactNode, type ReactElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

// Render popover content without portals so these tests exercise picker input
// and persistence behavior without starting a browser.
vi.mock("../ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => children,
  PopoverPopup: ({ children }: { children: ReactNode }) => children,
  PopoverTrigger: () => null,
  PopoverClose: () => null,
}));
vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ render }: { render: ReactElement }) => render,
  TooltipPopup: () => null,
}));

import { ProviderAccentColorPicker } from "./ProviderAccentColorPicker";
import { ThemeColorField } from "./ThemeColorPicker";

let renderer: ReactTestRenderer | undefined;
let nextFrameId = 0;
const frames = new Map<number, FrameRequestCallback>();

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrameId, callback);
    return nextFrameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  frames.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function slider(label: string) {
  return renderer!.root.findByProps({ role: "slider", "aria-label": label });
}

async function key(label: string, key: string, shiftKey = false) {
  const preventDefault = vi.fn();
  await act(async () => slider(label).props.onKeyDown({ key, shiftKey, preventDefault }));
  return preventDefault;
}

function pointer(clientX: number, clientY = 0, pointerId = 1) {
  return {
    button: 0,
    clientX,
    clientY,
    pointerId,
    currentTarget: {
      focus: vi.fn(),
      setPointerCapture: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    },
  };
}

async function frame() {
  await act(async () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  });
}

describe("shared color controls in settings", () => {
  it("lets provider colors use arrow keys, bounds saturation/brightness, and wraps hue", async () => {
    const onCommit = vi.fn();
    await act(async () => {
      renderer = create(
        <ProviderAccentColorPicker displayName="Codex" value="#ff0000" onCommit={onCommit} />,
      );
    });
    const hue = "Accent color hue";
    const plane = "Accent color saturation and brightness";
    expect(await key(hue, "ArrowLeft")).toHaveBeenCalledOnce();
    expect(slider(hue).props["aria-valuenow"]).toBe(359);
    await key(hue, "ArrowRight");
    expect(onCommit).toHaveBeenLastCalledWith("#ff0000");
    await key(plane, "ArrowRight", true);
    await key(plane, "ArrowUp", true);
    expect(onCommit).toHaveBeenLastCalledWith("#ff0000");
    await key(plane, "ArrowDown", true);
    expect(onCommit).toHaveBeenLastCalledWith("#e60000");
    await key(plane, "ArrowLeft", true);
    expect(onCommit).toHaveBeenLastCalledWith("#e61717");
    expect(slider(plane).props["aria-valuetext"]).toBe("saturation 90%, brightness 90%");
    onCommit.mockClear();
    expect(await key(hue, "Tab")).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("batches theme drag updates and flushes the final color with alpha on pointer release", async () => {
    const onChange = vi.fn();
    await act(async () => {
      renderer = create(<ThemeColorField role="accent" value="#ff000080" onChange={onChange} />);
    });
    const hue = "Accent color hue";
    await act(async () => slider(hue).props.onPointerDown(pointer(25)));
    await act(async () => slider(hue).props.onPointerMove(pointer(50)));
    expect(onChange).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
    // A second pointer cannot change or end the active drag.
    await act(async () => slider(hue).props.onPointerMove(pointer(75, 0, 2)));
    await act(async () => slider(hue).props.onPointerUp(pointer(75, 0, 2)));
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => slider(hue).props.onPointerUp(pointer(50)));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("accent", "#00ffff80");
    await act(async () => slider(hue).props.onLostPointerCapture(pointer(50)));
    await frame();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("clamps out-of-bounds drags and flushes theme changes on cancellation and unmount", async () => {
    const onChange = vi.fn();
    await act(async () => {
      renderer = create(<ThemeColorField role="accent" value="#ff000080" onChange={onChange} />);
    });
    const plane = "Accent color saturation and brightness";
    await act(async () => slider(plane).props.onPointerDown(pointer(-50, -50)));
    await act(async () => slider(plane).props.onPointerCancel(pointer(-50, -50)));
    expect(onChange).toHaveBeenLastCalledWith("accent", "#ffffff80");
    await act(async () => slider(plane).props.onPointerDown(pointer(150, 150)));
    await act(async () => renderer!.unmount());
    renderer = undefined;
    expect(onChange).toHaveBeenLastCalledWith("accent", "#00000080");
    expect(frames.size).toBe(0);
  });

  it("preserves the selected hue when a grey color is echoed back from theme settings", async () => {
    const onChange = vi.fn();
    const render = (value: string) => (
      <ThemeColorField role="accent" value={value} onChange={onChange} />
    );
    await act(async () => {
      renderer = create(render("#ff0000"));
    });
    const hue = "Accent color hue";
    const plane = "Accent color saturation and brightness";
    await key(hue, "ArrowRight", true);
    await act(async () => slider(plane).props.onPointerDown(pointer(0, 0)));
    await frame();
    expect(onChange).toHaveBeenLastCalledWith("accent", "#ffffff");
    await act(async () => renderer!.update(render("#ffffff")));
    expect(slider(hue).props["aria-valuenow"]).toBe(10);
  });

  it("keeps provider debounce at the consumer and commits pending color on unmount", async () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    await act(async () => {
      renderer = create(
        <ProviderAccentColorPicker
          displayName="Codex"
          value="#ff0000"
          onCommit={onCommit}
          commitDelayMs={250}
        />,
      );
    });
    const hue = "Accent color hue";
    await key(hue, "ArrowRight", true);
    await key(hue, "ArrowRight", true);
    expect(onCommit).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(250));
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("#ff5500");
    await key(hue, "ArrowRight", true);
    await act(async () => renderer!.unmount());
    renderer = undefined;
    expect(onCommit).toHaveBeenLastCalledWith("#ff8000");
    await act(async () => vi.advanceTimersByTime(250));
    expect(onCommit).toHaveBeenCalledTimes(2);
  });
});
