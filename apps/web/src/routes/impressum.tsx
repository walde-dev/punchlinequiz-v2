import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { A, AddressBlock, H2, LegalLayout, P } from "../components/legal-layout"
import { LEGAL } from "../lib/legal"
import { seo } from "../lib/seo"

export const Route = createFileRoute("/impressum")({
  component: ImpressumPage,
  head: () =>
    seo({
      title: "Impressum",
      description: "Anbieterkennzeichnung gemäß § 5 DDG für punchlinequiz.",
      path: "/impressum",
      noindex: true,
    }),
})

function ImpressumPage() {
  const { i18n } = useTranslation()
  const de = i18n.language.startsWith("de")
  return de ? <ImpressumDe /> : <ImpressumEn />
}

function ImpressumDe() {
  return (
    <LegalLayout eyebrow="/ Rechtliches" title="Impressum" lastUpdated={`Stand: ${LEGAL.lastUpdatedDe}`}>
      <H2>Angaben gemäß § 5 DDG</H2>
      <AddressBlock>
        {LEGAL.companyName}
        <br />
        {LEGAL.street}
        <br />
        {LEGAL.zip} {LEGAL.city}
        <br />
        {LEGAL.country}
      </AddressBlock>

      <H2>Vertreten durch</H2>
      <P>Geschäftsführer: {LEGAL.managingDirector}</P>

      <H2>Kontakt</H2>
      <P>
        E-Mail: <A href={LEGAL.emailHref}>{LEGAL.email}</A>
      </P>

      <H2>Registereintrag</H2>
      <P>
        Eintragung im Handelsregister.
        <br />
        Registergericht: {LEGAL.registerCourt}
        <br />
        Registernummer: {LEGAL.registerNumber}
      </P>

      <H2>Umsatzsteuer-ID</H2>
      <P>
        Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: {LEGAL.vatId}
      </P>

      <H2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</H2>
      <AddressBlock>
        {LEGAL.managingDirector}
        <br />
        {LEGAL.street}
        <br />
        {LEGAL.zip} {LEGAL.city}
      </AddressBlock>

      <H2>Verbraucherstreitbeilegung / Universalschlichtungsstelle</H2>
      <P>
        Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </P>

      <H2>Haftung für Inhalte</H2>
      <P>
        Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den
        allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir als Diensteanbieter jedoch nicht
        verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu
        forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrung der
        Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche
        Haftung ist erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden
        von entsprechenden Rechtsverletzungen entfernen wir diese Inhalte umgehend.
      </P>

      <H2>Haftung für Links</H2>
      <P>
        Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben.
        Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten
        Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich. Bei Bekanntwerden von
        Rechtsverletzungen werden wir derartige Links umgehend entfernen.
      </P>

      <H2>Urheberrecht</H2>
      <P>
        Die durch uns erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Die
        auf punchlinequiz dargestellten Songtexte und Bars sind urheberrechtlich geschützt und verbleiben im
        Eigentum der jeweiligen Rechteinhaber. Sie werden ausschließlich auszugsweise zu Quiz-, Bildungs- und
        Zitatzwecken (§ 51 UrhG) genutzt. Rechteinhaber, die eine Entfernung bestimmter Inhalte wünschen, wenden
        sich an <A href={LEGAL.emailHref}>{LEGAL.email}</A> — wir entfernen beanstandete Inhalte umgehend.
      </P>
    </LegalLayout>
  )
}

function ImpressumEn() {
  return (
    <LegalLayout eyebrow="/ Legal" title="Imprint" lastUpdated={`Last updated: ${LEGAL.lastUpdatedEn}`}>
      <P>
        This English version is provided for convenience only. The legally binding imprint is the German
        version, as required by § 5 of the German Digital Services Act (DDG).
      </P>

      <H2>Provider (§ 5 DDG)</H2>
      <AddressBlock>
        {LEGAL.companyName}
        <br />
        {LEGAL.street}
        <br />
        {LEGAL.zip} {LEGAL.city}
        <br />
        {LEGAL.countryEn}
      </AddressBlock>

      <H2>Represented by</H2>
      <P>Managing Director: {LEGAL.managingDirector}</P>

      <H2>Contact</H2>
      <P>
        Email: <A href={LEGAL.emailHref}>{LEGAL.email}</A>
      </P>

      <H2>Commercial register</H2>
      <P>
        Registered in the commercial register.
        <br />
        Register court: {LEGAL.registerCourt} (Local Court of Munich)
        <br />
        Register number: {LEGAL.registerNumber}
      </P>

      <H2>VAT ID</H2>
      <P>VAT identification number pursuant to § 27a German VAT Act: {LEGAL.vatId}</P>

      <H2>Responsible for content (§ 18 (2) MStV)</H2>
      <AddressBlock>
        {LEGAL.managingDirector}
        <br />
        {LEGAL.street}
        <br />
        {LEGAL.zip} {LEGAL.city}
      </AddressBlock>

      <H2>Consumer dispute resolution</H2>
      <P>
        We are neither willing nor obliged to participate in dispute resolution proceedings before a consumer
        arbitration board.
      </P>

      <H2>Copyright</H2>
      <P>
        Content created by us on these pages is subject to German copyright law. The song lyrics and bars shown on
        punchlinequiz are protected by copyright and remain the property of their respective rights holders. They
        are used only as short excerpts for quiz, educational and quotation purposes (§ 51 German Copyright Act).
        Rights holders who wish to have specific content removed may contact{" "}
        <A href={LEGAL.emailHref}>{LEGAL.email}</A> — we remove flagged content promptly.
      </P>
    </LegalLayout>
  )
}
