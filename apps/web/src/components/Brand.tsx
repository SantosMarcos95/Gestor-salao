import { Flower2 } from 'lucide-react';

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Flower2 size={26} strokeWidth={1.2} aria-hidden="true" />
      </span>
      <span>
        ateliê<span className="brand-small">GESTÃO DE SALÃO</span>
      </span>
    </div>
  );
}
