export const metadata = { title: "Privacy | RU ParkSmart" };

export default function Privacy() {
  return (
    <article className="max-w-prose space-y-7 text-[17px] leading-relaxed">
      <h1 className="text-[27px] font-extrabold leading-tight">How ParkSmart handles your data</h1>

      <section className="space-y-2">
        <h2 className="text-[21px] font-bold">What stays on your phone</h2>
        <p>Your permit type, class schedule and drive time are saved only in this browser. They&apos;re sent along when the app needs them to plan a trip, and our server doesn&apos;t keep them.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-[21px] font-bold">What the pilot records</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your lot reports: which lot, crowded or open, and when.</li>
          <li>Your trips: each time you tap &ldquo;I&apos;m going to Lot X&rdquo;, the lot, your planned park time and the status the app predicted. This happens whether or not you turn on check-ins.</li>
          <li>Your check-in answers: found a spot easily, had to circle, or lot was full.</li>
          <li>Anonymous usage: opening the app, which lot you chose, how long choosing took, whether you took a park-and-ride suggestion, and a 1 to 5 rating.</li>
          <li>All of it is tied to a random, scrambled ID, never to a name, email, student ID, license plate or location.</li>
          <li>These records are kept until the pilot data is deleted (see below).</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-[21px] font-bold">Trip check-ins</h2>
        <p>If you turn on check-ins, your trip also stores a notification address for this browser, so the server can send you &ldquo;Did you find a spot?&rdquo;. The address is deleted once the question is sent or the trip ends, within 12 hours of your park time. If the push service is briefly unavailable, the address is kept for up to an hour while the app retries. If you say No thanks, no notification address is stored, but the trip itself still is (see above). Your answer is stored with the same anonymous ID as reports.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-[21px] font-bold">What ParkSmart never does</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Track your location. The app never asks for it.</li>
          <li>Keep your schedule screenshot. Gemini reads it once, then it&apos;s discarded.</li>
          <li>Let the AI decide where you may park. Those answers come from the official Rutgers permit rules.</li>
          <li>Promise an open space, or override Rutgers parking policy.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-[21px] font-bold">Your choices</h2>
        <p>
          Go to <a className="link" href="/onboarding">Profile</a> and choose Erase my data on this phone to clear your profile, anonymous ID and check-in settings. Pilot records are deleted once the overall results are compiled.
        </p>
      </section>
    </article>
  );
}
