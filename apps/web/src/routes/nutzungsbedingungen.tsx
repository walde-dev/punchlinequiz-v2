import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { A, H2, LI, LegalLayout, P, UL } from "../components/legal-layout"
import { LEGAL } from "../lib/legal"
import { seo } from "../lib/seo"

export const Route = createFileRoute("/nutzungsbedingungen")({
  component: TermsPage,
  head: () =>
    seo({
      title: "Nutzungsbedingungen",
      description: "Die Bedingungen für die Nutzung von punchlinequiz.",
      path: "/nutzungsbedingungen",
      noindex: true,
    }),
})

function TermsPage() {
  const { i18n } = useTranslation()
  const de = i18n.language.startsWith("de")
  return de ? <TermsDe /> : <TermsEn />
}

function TermsDe() {
  return (
    <LegalLayout
      eyebrow="/ Rechtliches"
      title="Nutzungsbedingungen"
      lastUpdated={`Stand: ${LEGAL.lastUpdatedDe}`}
    >
      <H2>1. Geltungsbereich und Anbieter</H2>
      <P>
        Diese Nutzungsbedingungen regeln die Nutzung von punchlinequiz (www.punchlinequiz.de), angeboten von der{" "}
        {LEGAL.companyName}, {LEGAL.street}, {LEGAL.zip} {LEGAL.city} (nachfolgend „wir" oder „Anbieter"). Mit der
        Nutzung des Angebots erklärst du dich mit diesen Bedingungen einverstanden.
      </P>

      <H2>2. Leistungsbeschreibung</H2>
      <P>
        punchlinequiz ist ein Quiz-Spiel rund um deutschen Rap. Wir stellen das Spiel im jeweils verfügbaren Umfang
        kostenlos bereit. Ein Anspruch auf bestimmte Funktionen oder eine ununterbrochene Verfügbarkeit besteht
        nicht. Das Angebot befindet sich in fortlaufender Weiterentwicklung (Beta).
      </P>

      <H2>3. Konto und Mindestalter</H2>
      <P>
        Einige Funktionen — etwa das Sammeln von XP, die Ranglisten oder das Einreichen von Bars — erfordern ein
        Nutzerkonto. Du bist für die Geheimhaltung deiner Zugangsdaten und für Aktivitäten unter deinem Konto
        verantwortlich. Die Nutzung mit Konto ist Personen ab 16 Jahren gestattet; jüngere Personen dürfen das
        Angebot nur mit Einwilligung der Erziehungsberechtigten nutzen.
      </P>

      <H2>4. Von Nutzern eingereichte Inhalte</H2>
      <P>
        Du kannst eigene Inhalte einreichen (z. B. Bars/Punchlines). Du räumst uns hieran ein einfaches,
        unentgeltliches, zeitlich und räumlich unbeschränktes Recht ein, die eingereichten Inhalte im Rahmen des
        Dienstes zu speichern, anzuzeigen und zu verbreiten.
      </P>
      <P>
        Du sicherst zu, dass deine Einreichungen kurze Zitate zu Quizzwecken sind und keine Rechte Dritter
        verletzen. Für eingereichte Inhalte bist du selbst verantwortlich. Wir sind nicht verpflichtet, Inhalte
        vorab zu prüfen, behalten uns aber vor, eingereichte Inhalte jederzeit und ohne Vorankündigung zu
        bearbeiten oder zu entfernen.
      </P>

      <H2>5. Unzulässige Nutzung</H2>
      <P>Bei der Nutzung von punchlinequiz ist insbesondere untersagt:</P>
      <UL>
        <LI>das Einstellen rechtswidriger, beleidigender oder rechteverletzender Inhalte,</LI>
        <LI>die Manipulation von XP, Ranglisten oder Spielergebnissen, etwa durch Bots oder Automatisierung,</LI>
        <LI>massenhaftes Auslesen (Scraping) oder Überlasten der technischen Infrastruktur,</LI>
        <LI>die Belästigung anderer Nutzer sowie die Umgehung von Sicherheitsmaßnahmen.</LI>
      </UL>

      <H2>6. Geistiges Eigentum und Rechte Dritter</H2>
      <P>
        Marken, Logos, Software und Gestaltung von punchlinequiz sind geschützt. Die dargestellten Songtexte und
        Bars verbleiben im Eigentum der jeweiligen Rechteinhaber und werden nur auszugsweise zu Quiz-, Bildungs- und
        Zitatzwecken genutzt. Rechteinhaber können die Entfernung bestimmter Inhalte über{" "}
        <A href={LEGAL.emailHref}>{LEGAL.email}</A> verlangen; wir entfernen beanstandete Inhalte umgehend.
      </P>

      <H2>7. Verfügbarkeit, Beta-Status und keine Gewähr</H2>
      <P>
        Das Angebot wird „wie besehen" und „wie verfügbar" bereitgestellt. Wir übernehmen keine Gewähr für
        Fehlerfreiheit, die Richtigkeit der Inhalte oder eine ununterbrochene Verfügbarkeit und können Funktionen
        jederzeit ändern, einschränken oder einstellen.
      </P>

      <H2>8. Haftung</H2>
      <P>
        Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei der Verletzung von Leben, Körper
        oder Gesundheit. Bei einfacher Fahrlässigkeit haften wir nur bei der Verletzung wesentlicher
        Vertragspflichten (Pflichten, deren Erfüllung die ordnungsgemäße Durchführung überhaupt erst ermöglicht und
        auf deren Einhaltung du regelmäßig vertraust) und der Höhe nach begrenzt auf den vorhersehbaren,
        vertragstypischen Schaden. Im Übrigen ist die Haftung ausgeschlossen. Die Haftung nach dem
        Produkthaftungsgesetz bleibt unberührt.
      </P>

      <H2>9. Sperrung und Kündigung</H2>
      <P>
        Du kannst dein Konto jederzeit löschen. Wir können Konten bei Verstößen gegen diese Bedingungen oder gegen
        geltendes Recht verwarnen, sperren oder löschen.
      </P>

      <H2>10. Änderungen dieser Bedingungen</H2>
      <P>
        Wir können diese Nutzungsbedingungen anpassen, wenn dies aus rechtlichen oder funktionalen Gründen
        erforderlich ist. Über wesentliche Änderungen informieren wir in geeigneter Weise. Die fortgesetzte Nutzung
        nach Inkrafttreten der Änderungen gilt als Zustimmung.
      </P>

      <H2>11. Anwendbares Recht und Schlussbestimmungen</H2>
      <P>
        Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Zwingende
        Verbraucherschutzvorschriften des Staates deines gewöhnlichen Aufenthalts bleiben unberührt. Sollten
        einzelne Bestimmungen dieser Bedingungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen
        unberührt.
      </P>
    </LegalLayout>
  )
}

function TermsEn() {
  return (
    <LegalLayout
      eyebrow="/ Legal"
      title="Terms of Use"
      lastUpdated={`Last updated: ${LEGAL.lastUpdatedEn}`}
    >
      <P>
        This English version is provided for convenience. The legally binding version is the German
        Nutzungsbedingungen.
      </P>

      <H2>1. Scope and provider</H2>
      <P>
        These terms govern the use of punchlinequiz (www.punchlinequiz.de), offered by {LEGAL.companyName},{" "}
        {LEGAL.street}, {LEGAL.zip} {LEGAL.city} ("we" / "the provider"). By using the service you agree to these
        terms.
      </P>

      <H2>2. The service</H2>
      <P>
        punchlinequiz is a quiz game about German rap. We provide the game free of charge in its currently available
        scope. There is no entitlement to specific features or uninterrupted availability. The service is under
        ongoing development (beta).
      </P>

      <H2>3. Account and minimum age</H2>
      <P>
        Some features — such as earning XP, the leaderboards or submitting bars — require an account. You are
        responsible for keeping your credentials confidential and for activity under your account. Use with an
        account is permitted from the age of 16; younger people may use the service only with the consent of a legal
        guardian.
      </P>

      <H2>4. User-submitted content</H2>
      <P>
        You can submit your own content (e.g. bars/punchlines). You grant us a non-exclusive, royalty-free,
        worldwide and unlimited right to store, display and distribute the submitted content within the service.
      </P>
      <P>
        You warrant that your submissions are short quotes for quiz purposes and do not infringe third-party rights.
        You are responsible for the content you submit. We are not obliged to review content in advance but reserve
        the right to edit or remove submitted content at any time without notice.
      </P>

      <H2>5. Prohibited use</H2>
      <P>When using punchlinequiz, the following is prohibited in particular:</P>
      <UL>
        <LI>posting unlawful, abusive or infringing content,</LI>
        <LI>manipulating XP, leaderboards or game results, e.g. via bots or automation,</LI>
        <LI>mass scraping or overloading the technical infrastructure,</LI>
        <LI>harassing other users or circumventing security measures.</LI>
      </UL>

      <H2>6. Intellectual property and third-party rights</H2>
      <P>
        The trademarks, logos, software and design of punchlinequiz are protected. The song lyrics and bars shown
        remain the property of their respective rights holders and are used only as short excerpts for quiz,
        educational and quotation purposes. Rights holders can request removal of specific content via{" "}
        <A href={LEGAL.emailHref}>{LEGAL.email}</A>; we remove flagged content promptly.
      </P>

      <H2>7. Availability, beta status and no warranty</H2>
      <P>
        The service is provided "as is" and "as available". We give no warranty as to freedom from errors, the
        accuracy of content or uninterrupted availability, and may change, restrict or discontinue features at any
        time.
      </P>

      <H2>8. Liability</H2>
      <P>
        We are liable without limitation for intent and gross negligence and for injury to life, body or health. For
        ordinary negligence we are liable only for breach of essential contractual obligations (obligations whose
        fulfilment makes proper performance possible in the first place and on whose observance you may regularly
        rely), and limited to the foreseeable damage typical for this type of contract. Liability is otherwise
        excluded. Liability under the German Product Liability Act remains unaffected.
      </P>

      <H2>9. Suspension and termination</H2>
      <P>
        You can delete your account at any time. We may warn, suspend or delete accounts in the event of breaches of
        these terms or of applicable law.
      </P>

      <H2>10. Changes to these terms</H2>
      <P>
        We may amend these terms where required for legal or functional reasons. We will notify you of material
        changes by appropriate means. Continued use after the changes take effect constitutes acceptance.
      </P>

      <H2>11. Governing law and final provisions</H2>
      <P>
        The law of the Federal Republic of Germany applies, excluding the UN Convention on Contracts for the
        International Sale of Goods. Mandatory consumer-protection provisions of your country of habitual residence
        remain unaffected. Should individual provisions of these terms be invalid, the validity of the remaining
        provisions is unaffected.
      </P>
    </LegalLayout>
  )
}
