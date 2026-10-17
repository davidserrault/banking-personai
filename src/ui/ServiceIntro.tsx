import { t } from "./messages";

export function ServiceIntro({
  section,
}: {
  section: "configuration" | "reference";
}) {
  const steps =
    section === "configuration"
      ? ["define", "shape", "export"]
      : ["budget", "merchants", "apply"];
  return (
    <div className="service-intro">
      <p>{t(`studio.${section}Intro`)}</p>
      <ol className="process-steps">
        {steps.map((step) => (
          <li key={step}>
            <strong>{t(`studio.process.${step}.title`)}</strong>
            <span>{t(`studio.process.${step}.description`)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
