'use client';

import { Icon } from '../Icon';

export function QuantityInput({ value, max, onChange, disabled }: { value: number; max: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="qty" role="group" aria-label="Quantity">
      <button type="button" className="icon-button" disabled={disabled || value <= 1} onClick={() => onChange(value - 1)} aria-label="Decrease"><Icon name="minus" size={16} /></button>
      <output>{value}</output>
      <button type="button" className="icon-button" disabled={disabled || value >= max} onClick={() => onChange(value + 1)} aria-label="Increase"><Icon name="plus" size={16} /></button>
    </div>
  );
}
