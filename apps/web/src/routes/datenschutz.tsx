import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { A, AddressBlock, H2, LI, LegalLayout, P, UL } from "../components/legal-layout"
import { LEGAL } from "../lib/legal"
import { seo } from "../lib/seo"

export const Route = createFileRoute("/datenschutz")({
  component: DatenschutzPage,
  head: () =>
    seo({
      title: "Datenschutzerklärung",
      description: "Wie punchlinequiz personenbezogene Daten verarbeitet — Informationen nach Art. 13/14 DSGVO.",
      path: "/datenschutz",
      noindex: true,
    }),
})

function DatenschutzPage() {
  const { i18n } = useTranslation()
  const de = i18n.language.startsWith("de")
  return de ? <DatenschutzDe /> : <DatenschutzEn />
}

function DatenschutzDe() {
  return (
    <LegalLayout
      eyebrow="/ Rechtliches"
      title="Datenschutzerklärung"
      lastUpdated={`Stand: ${LEGAL.lastUpdatedDe}`}
    >
      <P>
        Wir nehmen den Schutz deiner personenbezogenen Daten ernst. Diese Erklärung informiert dich gemäß Art. 13
        und 14 DSGVO darüber, welche Daten wir bei der Nutzung von punchlinequiz (www.punchlinequiz.de)
        verarbeiten, zu welchen Zwecken und auf welcher Rechtsgrundlage.
      </P>

      <H2>1. Verantwortlicher</H2>
      <AddressBlock>
        {LEGAL.companyName}
        <br />
        {LEGAL.street}
        <br />
        {LEGAL.zip} {LEGAL.city}, {LEGAL.country}
        <br />
        Geschäftsführer: {LEGAL.managingDirector}
        <br />
        E-Mail: <A href={LEGAL.emailHref}>{LEGAL.email}</A>
      </AddressBlock>
      <P>
        Einen Datenschutzbeauftragten haben wir nicht bestellt, da hierzu keine gesetzliche Verpflichtung besteht.
        Bei Fragen zum Datenschutz erreichst du uns unter der oben genannten Adresse.
      </P>

      <H2>2. Hosting und Server-Logdaten</H2>
      <P>
        Unsere Anwendung wird bei der Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA, gehostet. Beim
        Aufruf der Seite werden technisch notwendige Zugriffsdaten verarbeitet, insbesondere IP-Adresse, Datum und
        Uhrzeit der Anfrage, abgerufene Ressource, übertragene Datenmenge und User-Agent. Dies dient der
        Auslieferung, Stabilität und Sicherheit des Angebots. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO
        (berechtigtes Interesse an einem sicheren, funktionsfähigen Betrieb). Mit Vercel besteht ein
        Auftragsverarbeitungsvertrag nach Art. 28 DSGVO. Zu einer möglichen Übermittlung in die USA siehe Abschnitt
        10.
      </P>

      <H2>3. Cookies und lokaler Speicher</H2>
      <P>
        punchlinequiz setzt nur technisch notwendige Cookies und nutzt den lokalen Speicher (localStorage) deines
        Browsers, unter anderem für deine Anmeldung/Session, deine Sprachwahl und den Spielfortschritt anonymer
        Sessions. Diese Speicherung ist für den von dir gewünschten Betrieb des Dienstes unbedingt erforderlich
        (§ 25 Abs. 2 TDDDG, Art. 6 Abs. 1 lit. f DSGVO). Daneben setzen wir zur Produktanalyse das Tool PostHog ein
        (siehe Abschnitt 5).
      </P>

      <H2>4. Nutzerkonten und Authentifizierung (Clerk)</H2>
      <P>
        Für Registrierung und Anmeldung nutzen wir Clerk, betrieben von der Clerk, Inc., 660 King Street, Unit 345,
        San Francisco, CA 94107, USA. Bei der Anmeldung über E-Mail oder einen Drittanbieter (z. B. Google)
        verarbeitet Clerk in unserem Auftrag deine E-Mail-Adresse, deinen Anzeige- bzw. Benutzernamen, dein
        Profilbild sowie Authentifizierungs-Identifikatoren. Zweck ist die Bereitstellung und Absicherung deines
        Kontos. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Erfüllung des Nutzungsverhältnisses). Es besteht
        ein Auftragsverarbeitungsvertrag nach Art. 28 DSGVO; zur Übermittlung in die USA siehe Abschnitt 10.
      </P>

      <H2>5. Produktanalyse und Reichweitenmessung (PostHog)</H2>
      <P>
        Zur Analyse der Nutzung und zur Verbesserung des Spiels setzen wir PostHog ein (PostHog, Inc., 2261 Market
        Street #4008, San Francisco, CA 94114, USA). Die Verarbeitung erfolgt auf der EU-Cloud von PostHog mit
        Servern in Frankfurt am Main, Deutschland. Verarbeitet werden unter anderem:
      </P>
      <UL>
        <LI>aufgerufene Seiten sowie Klick- und Spielereignisse,</LI>
        <LI>Geräte- und Browserinformationen,</LI>
        <LI>
          eine aus der IP-Adresse abgeleitete ungefähre Standortangabe (Land, Region, Stadt); die IP-Adresse selbst
          wird hierbei nicht dauerhaft gespeichert,
        </LI>
        <LI>bei angemeldeten Nutzern eine Verknüpfung der Ereignisse mit deiner Nutzer-ID.</LI>
      </UL>
      <P>
        Zusätzlich nutzen wir Session Recording: Aufzeichnungen von Seiteninteraktionen (z. B. Mausbewegungen,
        Klicks, Seitenwechsel), um Fehler und Bedienprobleme zu erkennen. Eingaben in Formularfeldern werden dabei
        automatisch maskiert und nicht aufgezeichnet.
      </P>
      <P>
        Rechtsgrundlage ist unser berechtigtes Interesse an der Analyse, Sicherheit und Verbesserung unseres
        Angebots (Art. 6 Abs. 1 lit. f DSGVO). Du kannst dieser Verarbeitung jederzeit widersprechen (siehe
        Abschnitt 9). Wir deaktivieren die Analyse auf Wunsch für dich; zudem unterbinden das Blockieren von Cookies
        oder ein Inhalts-/Tracking-Blocker im Browser die Erfassung. Mit PostHog besteht ein
        Auftragsverarbeitungsvertrag nach Art. 28 DSGVO.
      </P>

      <H2>6. Fehler-Monitoring (Sentry)</H2>
      <P>
        Zur Erkennung und Behebung technischer Fehler nutzen wir Sentry (Functional Software, Inc. dba Sentry, 45
        Fremont Street, 8th Floor, San Francisco, CA 94105, USA). Die Verarbeitung erfolgt in der EU-Region von
        Sentry (Frankfurt am Main, Deutschland). Bei einem Fehler werden technische Informationen übermittelt, etwa
        die Fehlermeldung, Browser- und Geräteangaben, die betroffene Seite, eine anonyme Session-Kennung sowie
        gegebenenfalls die IP-Adresse. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an
        Stabilität und Sicherheit). Es besteht ein Auftragsverarbeitungsvertrag nach Art. 28 DSGVO.
      </P>

      <H2>7. Technisches Event-Logging (Axiom)</H2>
      <P>
        Zur Fehlersuche und zur Analyse des Betriebs protokollieren wir technische Ereignisse über Axiom (Axiom,
        Inc., USA); die Verarbeitung erfolgt in der EU-Region (eu-central-1). Diese Protokolle enthalten nur
        anonyme Session-Kennungen und technische Ereignisdaten, jedoch keine direkt identifizierenden Angaben wie
        Namen, E-Mail-Adressen oder IP-Adressen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO.
      </P>

      <H2>8. Discord-Community</H2>
      <P>
        Wir verlinken auf unseren Discord-Server. Wenn du diesem beitrittst, gelten die Datenschutzbestimmungen von
        Discord (Discord Netherlands BV bzw. Discord Inc.). Auf die dortige Verarbeitung haben wir keinen Einfluss.
      </P>

      <H2>9. Deine Rechte</H2>
      <P>Dir stehen nach der DSGVO insbesondere die folgenden Rechte zu:</P>
      <UL>
        <LI>Auskunft über die zu dir gespeicherten Daten (Art. 15 DSGVO),</LI>
        <LI>Berichtigung unrichtiger Daten (Art. 16 DSGVO),</LI>
        <LI>Löschung (Art. 17 DSGVO),</LI>
        <LI>Einschränkung der Verarbeitung (Art. 18 DSGVO),</LI>
        <LI>Datenübertragbarkeit (Art. 20 DSGVO),</LI>
        <LI>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO).</LI>
      </UL>
      <P>
        <strong className="font-semibold text-foreground/90">Widerspruchsrecht:</strong> Soweit wir Daten auf
        Grundlage berechtigter Interessen (Art. 6 Abs. 1 lit. f DSGVO) verarbeiten, kannst du dieser Verarbeitung
        jederzeit mit Wirkung für die Zukunft widersprechen. Zur Ausübung deiner Rechte genügt eine formlose
        Nachricht an <A href={LEGAL.emailHref}>{LEGAL.email}</A>.
      </P>

      <H2>10. Übermittlung in Drittländer</H2>
      <P>
        Einige der eingesetzten Anbieter haben Mutterunternehmen in den USA. Soweit dabei personenbezogene Daten in
        die USA übermittelt werden, stützen wir dies auf die Standardvertragsklauseln der EU-Kommission (Art. 46
        DSGVO) und — soweit der Anbieter zertifiziert ist — auf das EU-US Data Privacy Framework (Art. 45 DSGVO).
        Bei den datenintensiven Diensten (PostHog, Sentry, Axiom) erfolgt die Verarbeitung zudem auf Servern
        innerhalb der EU.
      </P>

      <H2>11. Speicherdauer</H2>
      <P>
        Kontodaten verarbeiten wir, solange dein Konto besteht. Nach einer Löschung werden sie entfernt, soweit
        keine gesetzlichen Aufbewahrungspflichten entgegenstehen. Analyse-, Log- und Fehlerdaten speichern wir nur
        so lange, wie es für die genannten Zwecke erforderlich ist, und löschen oder anonymisieren sie anschließend.
      </P>

      <H2>12. Beschwerderecht bei einer Aufsichtsbehörde</H2>
      <P>
        Du hast das Recht, dich bei einer Datenschutz-Aufsichtsbehörde über die Verarbeitung deiner
        personenbezogenen Daten zu beschweren. Für uns zuständig ist das Bayerische Landesamt für Datenschutzaufsicht
        (BayLDA), Promenade 18, 91522 Ansbach.
      </P>

      <H2>13. Änderungen dieser Erklärung</H2>
      <P>
        Wir passen diese Datenschutzerklärung an, wenn sich die Rechtslage oder unsere Dienste ändern. Es gilt die
        jeweils auf dieser Seite veröffentlichte Fassung.
      </P>
    </LegalLayout>
  )
}

function DatenschutzEn() {
  return (
    <LegalLayout
      eyebrow="/ Legal"
      title="Privacy Policy"
      lastUpdated={`Last updated: ${LEGAL.lastUpdatedEn}`}
    >
      <P>
        This English version is provided for convenience. The legally binding version is the German
        Datenschutzerklärung. We take the protection of your personal data seriously and inform you below, in line
        with Art. 13/14 GDPR, about how we process data when you use punchlinequiz (www.punchlinequiz.de).
      </P>

      <H2>1. Controller</H2>
      <AddressBlock>
        {LEGAL.companyName}
        <br />
        {LEGAL.street}
        <br />
        {LEGAL.zip} {LEGAL.city}, {LEGAL.countryEn}
        <br />
        Managing Director: {LEGAL.managingDirector}
        <br />
        Email: <A href={LEGAL.emailHref}>{LEGAL.email}</A>
      </AddressBlock>
      <P>
        We have not appointed a Data Protection Officer, as we are not legally required to. For any privacy
        questions, reach us at the address above.
      </P>

      <H2>2. Hosting and server logs</H2>
      <P>
        Our application is hosted by Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA. When you access the
        site, technically necessary access data is processed — in particular your IP address, date and time of the
        request, the resource requested, the volume of data transferred and the user agent — to deliver and secure
        the service. The legal basis is Art. 6(1)(f) GDPR (legitimate interest in secure, reliable operation). A
        data processing agreement under Art. 28 GDPR is in place. On transfers to the USA, see section 10.
      </P>

      <H2>3. Cookies and local storage</H2>
      <P>
        punchlinequiz uses only technically necessary cookies and your browser's local storage — among other things
        for your sign-in/session, your language choice and the game progress of anonymous sessions. This storage is
        strictly necessary to provide the service you requested (§ 25(2) TDDDG, Art. 6(1)(f) GDPR). In addition, we
        use the product-analytics tool PostHog (see section 5).
      </P>

      <H2>4. Accounts and authentication (Clerk)</H2>
      <P>
        For registration and sign-in we use Clerk, operated by Clerk, Inc., 660 King Street, Unit 345, San
        Francisco, CA 94107, USA. When you sign in via email or a third party (e.g. Google), Clerk processes your
        email address, display/username, profile picture and authentication identifiers on our behalf, to provide
        and secure your account. The legal basis is Art. 6(1)(b) GDPR (performance of the user relationship). A data
        processing agreement under Art. 28 GDPR is in place; on transfers to the USA, see section 10.
      </P>

      <H2>5. Product analytics (PostHog)</H2>
      <P>
        To analyse usage and improve the game we use PostHog (PostHog, Inc., 2261 Market Street #4008, San
        Francisco, CA 94114, USA). Processing takes place on PostHog's EU Cloud with servers in Frankfurt am Main,
        Germany. We process, among other things:
      </P>
      <UL>
        <LI>pages viewed and click/gameplay events,</LI>
        <LI>device and browser information,</LI>
        <LI>
          an approximate location derived from your IP address (country, region, city); the IP address itself is
          not stored permanently,
        </LI>
        <LI>for signed-in users, a link between events and your user ID.</LI>
      </UL>
      <P>
        We also use session recording: recordings of page interactions (e.g. mouse movement, clicks, navigation) to
        detect bugs and usability problems. Input in form fields is automatically masked and not recorded.
      </P>
      <P>
        The legal basis is our legitimate interest in analysing, securing and improving our service (Art. 6(1)(f)
        GDPR). You may object to this processing at any time (see section 9). On request we will disable analytics
        for you; blocking cookies or using a content/tracking blocker in your browser also prevents collection. A
        data processing agreement under Art. 28 GDPR is in place.
      </P>

      <H2>6. Error monitoring (Sentry)</H2>
      <P>
        To detect and fix technical errors we use Sentry (Functional Software, Inc. dba Sentry, 45 Fremont Street,
        8th Floor, San Francisco, CA 94105, USA), processed in Sentry's EU region (Frankfurt am Main, Germany). When
        an error occurs, technical information is transmitted, such as the error message, browser and device
        details, the affected page, an anonymous session identifier and possibly the IP address. The legal basis is
        Art. 6(1)(f) GDPR (legitimate interest in stability and security). A data processing agreement under Art. 28
        GDPR is in place.
      </P>

      <H2>7. Technical event logging (Axiom)</H2>
      <P>
        For debugging and operational analysis we log technical events via Axiom (Axiom, Inc., USA), processed in
        the EU region (eu-central-1). These logs contain only anonymous session identifiers and technical event
        data — no directly identifying information such as names, email addresses or IP addresses. The legal basis
        is Art. 6(1)(f) GDPR.
      </P>

      <H2>8. Discord community</H2>
      <P>
        We link to our Discord server. If you join it, Discord's privacy terms apply (Discord Netherlands BV /
        Discord Inc.). We have no influence over the processing carried out there.
      </P>

      <H2>9. Your rights</H2>
      <P>Under the GDPR you have, in particular, the following rights:</P>
      <UL>
        <LI>access to the data we store about you (Art. 15 GDPR),</LI>
        <LI>rectification of inaccurate data (Art. 16 GDPR),</LI>
        <LI>erasure (Art. 17 GDPR),</LI>
        <LI>restriction of processing (Art. 18 GDPR),</LI>
        <LI>data portability (Art. 20 GDPR),</LI>
        <LI>objection to processing (Art. 21 GDPR).</LI>
      </UL>
      <P>
        <strong className="font-semibold text-foreground/90">Right to object:</strong> where we process data on the
        basis of legitimate interests (Art. 6(1)(f) GDPR), you may object at any time with effect for the future. To
        exercise your rights, an informal message to <A href={LEGAL.emailHref}>{LEGAL.email}</A> is enough.
      </P>

      <H2>10. Transfers to third countries</H2>
      <P>
        Some of the providers we use have parent companies in the USA. Where personal data is transferred to the
        USA, we rely on the EU Commission's Standard Contractual Clauses (Art. 46 GDPR) and — where the provider is
        certified — on the EU-US Data Privacy Framework (Art. 45 GDPR). For the data-intensive services (PostHog,
        Sentry, Axiom), processing additionally takes place on servers within the EU.
      </P>

      <H2>11. Retention</H2>
      <P>
        We process account data for as long as your account exists. After deletion it is removed, unless statutory
        retention obligations apply. Analytics, log and error data is kept only as long as necessary for the stated
        purposes and is then deleted or anonymised.
      </P>

      <H2>12. Right to lodge a complaint</H2>
      <P>
        You have the right to lodge a complaint with a data protection supervisory authority. The authority
        responsible for us is the Bavarian State Office for Data Protection Supervision (BayLDA), Promenade 18,
        91522 Ansbach, Germany.
      </P>

      <H2>13. Changes to this policy</H2>
      <P>
        We will update this privacy policy when the legal situation or our services change. The version published
        on this page applies.
      </P>
    </LegalLayout>
  )
}
