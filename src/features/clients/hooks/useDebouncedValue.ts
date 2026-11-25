import { useEffect, useState } from 'react';

/**
 * Откладывает обновление значения: используется для поиска по мере ввода
 * с задержкой около 300 мс (раздел 5 ТЗ).
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
