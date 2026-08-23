import { Fragment } from "react";

export default function EditableText({ text }: { text: string }) {
  return text.split("\n").map((line, index) => (
    <Fragment key={`${index}-${line}`}>
      {index > 0 && <br />}
      {line}
    </Fragment>
  ));
}
