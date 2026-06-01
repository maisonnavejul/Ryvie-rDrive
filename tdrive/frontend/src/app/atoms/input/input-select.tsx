import _, { isUndefined } from "lodash";
import { defaultInputClassName, errorInputClassName, ThemeName } from './input-text';
import { CSSProperties } from "@mui/styles";

export type SelectSize = 'md' | 'lg' | 'sm';

interface InputProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  theme?: ThemeName;
  hasError?: boolean;
  size?: SelectSize;
  className?: string;
  children?: React.ReactNode;
  noFocusBorder?: boolean;
}

export function Select(props: InputProps) {
  let inputClassName = props.hasError
    ? errorInputClassName(props.theme)
    : defaultInputClassName(props.theme);
  inputClassName = inputClassName + (props.disabled ? ' opacity-75' : '');

  if (props.size === 'lg') inputClassName = inputClassName + ' text-lg h-11';
  else if (props.size === 'sm') inputClassName = inputClassName + ' text-sm h-7 py-0 px-3';
  else inputClassName = inputClassName + ' text-base h-9 py-1';

  //special for safari
  let styles = { textAlignLast: "right" } as CSSProperties;
  const noFocus = isUndefined(props.noFocusBorder) ? true : props.noFocusBorder;
  if (noFocus) styles = _.assign(styles, {boxShadow: "none", borderColor: "inherit"});

  return (
    <select
      style={styles}
      className={inputClassName + ' ' + props.className}
      {..._.omit(props, 'label', 'className', 'size')}
    >
      {props.children}
    </select>
  );
}

export default Select;
