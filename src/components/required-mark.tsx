/** Visual "required field" indicator. The input's own `required` conveys it
 * to assistive tech, so this asterisk is decorative. */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-red-500">
      *
    </span>
  );
}
