/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  createElement,
  ReactNode,
  ComponentType,
  forwardRef,
  useContext,
  useMemo,
  Children,
  isValidElement,
} from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim";
import { isFragment } from "react-is";

import { InteractionProps, useInteraction } from "./use-interaction";
import { withStyledProps } from "./with-styled-props";
import { GroupContext } from "./group-context";
import { useComponentState } from "./use-component-state";
import { withConditionals } from "./conditionals";
import {
  getChildClasses,
  getStyleSet,
  subscribeToStyleSheet,
} from "../../style-sheet/native/runtime";
import type { StyledOptions } from "../index";
import { View } from "react-native";

export function styled(
  component: ComponentType,
  styledBaseClassNameOrOptions?:
    | string
    | StyledOptions<Record<string, unknown>, string>,
  maybeOptions: StyledOptions<Record<string, unknown>, string> = {}
) {
  const { props: propsToTransform, classProps } =
    typeof styledBaseClassNameOrOptions === "object"
      ? styledBaseClassNameOrOptions
      : maybeOptions;

  const baseClassName =
    typeof styledBaseClassNameOrOptions === "string"
      ? styledBaseClassNameOrOptions
      : maybeOptions?.baseClassName;

  const Styled = forwardRef((props, ref) => {
    return (
      <StyledComponent
        ref={ref}
        component={component}
        propsToTransform={propsToTransform}
        classProps={classProps}
        baseClassName={baseClassName}
        {...props}
      />
    );
  });
  if (typeof component !== "string") {
    Styled.displayName = `NativeWind.${
      component.displayName || component.name || "NoName"
    }`;
  }

  return Styled;
}

export const StyledComponent = forwardRef(
  (
    {
      component: Component,
      baseClassName,
      tw: twClassName,
      className: propClassName,
      propsToTransform,
      classProps,
      children,
      style: inlineStyles,
      ...componentProps
    }: any,
    ref
  ) => {
    const groupContext = useContext(GroupContext);

    /**
     * Get the hover/focus/active state of this component
     */
    const [componentState, dispatch] = useComponentState();

    const classNameWithDefaults = [baseClassName, twClassName ?? propClassName]
      .filter(Boolean)
      .join(" ");

    /**
     * Resolve the props/classProps/spreadProps options
     */
    const { styledProps, className } = withStyledProps({
      className: classNameWithDefaults,
      propsToTransform,
      classProps,
      componentState,
      componentProps,
    });

    const { className: actualClassName, meta } = withConditionals(className, {
      ...componentState,
      ...groupContext,
    });

    /**
     * Resolve the className->style
     */
    const styles = useSyncExternalStore(
      subscribeToStyleSheet,
      () => getStyleSet(actualClassName),
      () => getStyleSet(actualClassName)
    );

    /**
     * Determine if we need event handlers for our styles
     */
    const handlers = useInteraction(
      dispatch,
      meta,
      componentProps as InteractionProps
    );

    /**
     * Resolve the child styles
     */
    const childClasses = getChildClasses(actualClassName);
    if (childClasses && children) {
      children = flattenChildren(children)?.map((child) => {
        if (isValidElement(child)) {
          return createElement(StyledComponent, {
            key: child.key,
            component: child.type,
            ...child.props,
            className: [childClasses, child.props.className ?? child.props.tw]
              .filter(Boolean)
              .join(" "),
          });
        }

        return child;
      });
    }

    const style = useMemo(() => {
      const keys = Object.keys(styles).length;
      if (keys > 0 && inlineStyles) {
        return [styles, inlineStyles];
      } else if (keys > 0) {
        return styles;
      }
    }, [styles, inlineStyles]);

    /**
     * Pass the styles to the element
     */
    const props = {
      ...componentProps,
      ...handlers,
      ...styledProps,
      style,
      ref,
    };
    if (children) props.children = children;
    let reactNode: ReactNode = createElement(Component, props);

    /**
     * Determine if we need to wrap element in Providers
     */
    if (meta.group) {
      reactNode = createElement(GroupContext.Provider, {
        children: reactNode,
        value: {
          "group-hover": groupContext["group-hover"] || componentState.hover,
          "group-focus": groupContext["group-focus"] || componentState.focus,
          "group-active": groupContext["group-active"] || componentState.active,
        },
      });
    }

    return reactNode;
  }
);

function flattenChildren(
  children: ReactNode | ReactNode[]
): ReactNode[] | undefined | null {
  return Children.toArray(children).flatMap((child) => {
    if (isFragment(child)) return flattenChildren(child.props.children);
    if (typeof child === "string" || typeof child === "number") {
      return child;
    }
    if (!child || !isValidElement(child)) return [];
    return child;
  });
}
