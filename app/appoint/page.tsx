import type { Metadata } from "next";
import Link from "next/link";
import BrandMark from "../BrandMark";
import DhuCourseManager from "../admin/DhuCourseManager";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "东华大学课程预约｜reshi 的日记本",
  description: "在网页上完成学校验证、选择课程和教材，并预约报名时间。",
};

export default function AppointmentPage() {
  return <main className={styles.shell}>
    <header className={styles.header}>
      <Link className="brand" href="/"><BrandMark />reshi 的日记本</Link>
      <span>课程预约</span>
    </header>
    <div className={styles.content}><DhuCourseManager /></div>
  </main>;
}
