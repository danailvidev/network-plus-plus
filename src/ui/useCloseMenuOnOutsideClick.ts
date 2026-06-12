import { useEffect, type RefObject } from 'react';

export const useCloseMenuOnOutsideClick = (menuRef: RefObject<HTMLElement | null>, isOpen: boolean, onClose: () => void) => {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (menu?.contains(event.target as Node)) {
        return;
      }

      onClose();
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen, menuRef, onClose]);
};
