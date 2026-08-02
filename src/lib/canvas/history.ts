import type { Canvas } from "fabric";

export function createHistoryController() {
  let canvas: Canvas | null = null;
  let stack: string[] = [];
  let index = -1;
  let locked = false;

  return {
    attach(c: Canvas) {
      canvas = c;
    },
    reset(json: string) {
      stack = [json];
      index = 0;
    },
    save() {
      if (!canvas || locked) return;
      const json = JSON.stringify(canvas.toJSON());
      if (stack[index] === json) return;
      stack = stack.slice(0, index + 1);
      stack.push(json);
      if (stack.length > 50) {
        stack.shift();
      } else {
        index += 1;
      }
    },
    async undo() {
      if (!canvas || index <= 0) return;
      locked = true;
      index -= 1;
      await canvas.loadFromJSON(JSON.parse(stack[index]) as object);
      canvas.requestRenderAll();
      locked = false;
      window.dispatchEvent(new CustomEvent("hourse:dirty"));
    },
    async redo() {
      if (!canvas || index >= stack.length - 1) return;
      locked = true;
      index += 1;
      await canvas.loadFromJSON(JSON.parse(stack[index]) as object);
      canvas.requestRenderAll();
      locked = false;
      window.dispatchEvent(new CustomEvent("hourse:dirty"));
    },
  };
}
