import spinnerUrl from '../assets/icons/spinner.svg';

// The kit's loading wheel, spinning. Everywhere the app waits it used to say
// so in words — "скачем...", "секунду...", "Сохраняю..." — which reads as a
// message rather than as a state, and leaves nothing on screen for the cases
// where there is no room for a sentence.
//
// `color` tints the svg through a mask rather than filtering it, so it works
// on any background without inventing a second asset per colour.
export default function Spinner({ size = 16, color = '#66FCF1', className }: {
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label="Загрузка"
      className={className}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        flexShrink: 0,
        background: color,
        WebkitMaskImage: `url(${spinnerUrl})`,
        maskImage: `url(${spinnerUrl})`,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        animation: 'spinner-turn 0.9s linear infinite',
      }}
    />
  );
}
