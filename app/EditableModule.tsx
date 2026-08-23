import type { CSSProperties, ReactNode } from "react";
import type { SiteModule } from "../lib/site-pages";

export default function EditableModule({ module, children }: { module: SiteModule; children: ReactNode }) {
  if (module.hidden) return null;
  return (
    <div
      className="site-module-frame"
      data-module-id={module.id}
      data-module-spacing={module.styles.spacing}
      data-module-align={module.styles.align}
      data-module-width={module.styles.width}
      style={{ "--module-frame-width": module.styles.width === "narrow" ? "920px" : module.styles.width === "wide" ? "1380px" : "1180px" } as CSSProperties}
    >
      {children}
    </div>
  );
}
