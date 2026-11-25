import './ColumnTitle.css';

interface ColumnTitleProps {
  children: string;
}

/** Название столбца в шапке. */
export function ColumnTitle({ children }: ColumnTitleProps) {
  return <span className="column-title">{children}</span>;
}
