/* eslint-disable @next/next/no-img-element -- user uploads are served through the authenticated file endpoint */
import Icon from "./Icon";

export default function ReaderAvatar({ src, name, size = 42 }: { src?: string | null; name: string; size?: number }) {
  return <span className="reader-avatar" style={{ width: size, height: size }} aria-hidden="true">
    {src ? <img src={src} alt="" /> : <Icon name="user" />}
    <span className="sr-only">{name}</span>
  </span>;
}
