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
          <li>Anonymous usage: opening the app, which lot you chose, how long choosing took, whether you took a park-and-ride suggestion, and a 1 to 5 rating.</li>
          <li>All of it is tied to a random, scrambled ID, never to a name, email, student ID, license plate or location.</li>
        </ul>
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
          Go to <a className="link" href="/onboarding">Profile</a> and choose Erase my data on this phone to clear your profile and anonymous ID. Pilot records are deleted once the overall results are compiled.
        </p>
      </section>
    </article>
  );
}
