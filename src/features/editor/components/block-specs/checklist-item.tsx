"use client";

import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { AnimatedCheckbox } from "./animated-checkbox";

export const createCheckListItem = createReactBlockSpec(
  {
    type: "checkListItem",
    propSchema: {
      ...defaultProps,
      checked: {
        default: false,
        type: "boolean" as const,
      },
    },
    content: "inline" as const,
  },
  {
    render: (props) => (
      <div className="flex items-start gap-2 my-0.5 group/checklist">
        <AnimatedCheckbox
          checked={props.block.props.checked}
          onChange={(checked) =>
            props.editor.updateBlock(props.block, {
              type: "checkListItem",
              props: { checked },
            })
          }
        />
        <div
          ref={props.contentRef}
          className="flex-1 min-w-0 transition-all duration-[360ms]"
          style={{
            textDecoration: props.block.props.checked ? "line-through" : "none",
            opacity: props.block.props.checked ? 0.55 : 1,
          }}
        />
      </div>
    ),
    toExternalHTML: (props) => (
      <li>
        <input
          type="checkbox"
          checked={props.block.props.checked}
          disabled
          readOnly
        />
        <div ref={props.contentRef} />
      </li>
    ),
  },
);
