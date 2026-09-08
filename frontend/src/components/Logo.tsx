/**
 * Logo dell'organizzazione.
 * Usa /logo.svg dalla cartella public.
 * Se il file non esiste mostra un fallback testuale.
 */
interface LogoProps {
  height?: number;
  style?: React.CSSProperties;
}

export default function Logo({ height = 36, style }: LogoProps) {
  return (
    <img
      src="/logo.svg"
      alt="CISL Logo"
      height={height}
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
      onError={(e) => {
        // Fallback: nascondi l'immagine se non trovata
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}
