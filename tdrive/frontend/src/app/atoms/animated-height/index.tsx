import _ from "lodash";
import {
  InputHTMLAttributes,
  memo,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
} from "react";

export const AnimatedHeight = memo(
  (props: { children: ReactNode } & InputHTMLAttributes<HTMLDivElement>) => {
    const el = useRef<HTMLDivElement>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const updateSize = useCallback(() => {
      if (el.current) {
        const contentHeight = el.current.scrollHeight;
        const parent = el.current.parentNode as HTMLDivElement;
        if (parent) {
          parent.style.height = `${contentHeight}px`;
          parent.style.overflow = `hidden`;
        }
      }
    }, []);

    useEffect(() => {
      intervalRef.current = setInterval(() => {
        updateSize();
      }, 200);
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }, [updateSize]);

    return (
      <div className="transition-all px-1 -mx-1">
        <div
          {..._.omit(props, "children")}
          ref={el}
          style={{
            boxSizing: "border-box",
          }}
        >
          {props.children}
        </div>
      </div>
    );
  }
);
