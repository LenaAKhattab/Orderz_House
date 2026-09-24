import { useCallback, useEffect, useRef, useState } from "react";
import LegacySmartTextField from "./LegacySmartTextField";
import { legacyFreelancerFieldSuggestionsRequest } from "../../services/api";

/**
 * Smart text wired to the public anonymous suggestions API for one field key.
 */
export default function LegacySmartSuggestField({
  fieldKey,
  value,
  onChange,
  required,
  disabled,
  inputClassName,
  className,
  id,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const reqSeq = useRef(0);
  const debounceRef = useRef(null);

  const fetchSuggestions = useCallback(
    async (q) => {
      const seq = ++reqSeq.current;
      setLoading(true);
      try {
        const res = await legacyFreelancerFieldSuggestionsRequest(fieldKey, q);
        if (seq !== reqSeq.current) return;
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setSuggestions(list.filter((x) => typeof x === "string"));
      } catch {
        if (seq === reqSeq.current) setSuggestions([]);
      } finally {
        if (seq === reqSeq.current) setLoading(false);
      }
    },
    [fieldKey],
  );

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const schedule = (q) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(q), 180);
  };

  return (
    <LegacySmartTextField
      id={id}
      value={value}
      onChange={onChange}
      required={required}
      disabled={disabled}
      inputClassName={inputClassName}
      className={className}
      suggestions={suggestions}
      loading={loading}
      onFocusFetch={() => fetchSuggestions(value || "")}
      onQueryChange={schedule}
    />
  );
}
