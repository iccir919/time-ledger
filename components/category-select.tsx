export type CategoryGroup = {
  id: string;
  name: string;
  categories: { id: string; name: string }[];
};

type CategorySelectProps = {
  name: string;
  groups: CategoryGroup[];
  defaultValue?: string;
  placeholder: string;
  required?: boolean;
  ariaLabel: string;
};

export default function CategorySelect({
  name,
  groups,
  defaultValue = "",
  placeholder,
  required = false,
  ariaLabel,
}: CategorySelectProps) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      required={required}
      aria-label={ariaLabel}
      className="rounded-md border border-stone-200 bg-white px-2 py-1 text-sm text-stone-700"
    >
      <option value="">{placeholder}</option>
      {groups.map((group) => (
        <optgroup key={group.id} label={group.name}>
          {group.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}