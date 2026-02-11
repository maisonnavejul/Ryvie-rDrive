import React, { useRef, useCallback, useEffect } from 'react';
import MenusManager from '@components/menus/menus-manager.jsx';

/*
  One menu
*/
export default function Menu(props) {
  const {
    menu,
    className,
    style,
    position,
    toggle,
    onOpen,
    onClose,
    sortData,
    testClassId,
    enableMobileMenu,
    children,
  } = props;
  const containerRef = useRef(null);
  const openRef = useRef(false);
  const previousMenusIdRef = useRef(null);
  const previousMenusNumberRef = useRef(0);

  // Track menu state changes to detect when our menu was closed externally
  useEffect(() => {
    const listener = () => {
      if (
        (MenusManager.menus.length === 0 && previousMenusNumberRef.current > 0) ||
        MenusManager.last_opened_id !== previousMenusIdRef.current
      ) {
        if (openRef.current && onClose) {
          onClose();
        }
        openRef.current = false;
      }
      previousMenusNumberRef.current = MenusManager.menus.length;
    };

    MenusManager.addListener(listener);
    return () => {
      if (onClose && openRef.current) {
        onClose();
      }
      MenusManager.removeListener(listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openMenu = useCallback(
    async (evt) => {
      if (openRef.current) {
        openRef.current = false;
        MenusManager.closeMenu();
      } else {
        evt.preventDefault();
        evt.stopPropagation();
        const elementRect = containerRef.current.getBoundingClientRect();
        elementRect.x = elementRect.x || elementRect.left;
        elementRect.y = elementRect.y || elementRect.top;
        previousMenusIdRef.current = await MenusManager.openMenu(
          menu,
          elementRect,
          position,
          undefined,
          testClassId,
          enableMobileMenu,
        );
        openRef.current = true;
        if (onOpen) onOpen();
      }
    },
    [menu, position, testClassId, enableMobileMenu, onOpen],
  );

  const handleClick = useCallback(
    async (evt) => {
      if (toggle) {
        if (!openRef.current) {
          await openMenu(evt);
        } else {
          MenusManager.closeMenu();
          openRef.current = false;
          if (onClose) onClose();
        }
      } else {
        await openMenu(evt);
      }
    },
    [toggle, openMenu, onClose],
  );

  return (
    <div
      ref={containerRef}
      style={style}
      onClick={handleClick}
      className={className}
    >
      {children}
    </div>
  );
}
