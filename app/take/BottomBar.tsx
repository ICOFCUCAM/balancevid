import Icon from '../Icon.js';

/**
 * The bar at the foot of every screen in the Take App.
 *   [the uploaded designs; D-04, D-19, D-21]
 *
 * > Home · Discover · Take · My Takes · Profile
 *
 * ONE BAR, DRAWN BY ONE FILE. It was written inline in the home
 * screen, so the Library and the Profile had none — a person who
 * opened their own work from the home screen could get back only
 * by the browser's own button, and on an installed app there is
 * no browser button. Copying it into three files would have been
 * three places for a tab to rot.
 *
 * EVERY TAB GOES SOMEWHERE THAT EXISTS, which is the rule it was
 * built under and the reason the names took two passes to settle.
 * Discover is the network's own directory, Take Part is the open
 * calls, My Takes is this device's work, and Profile is the
 * installations it takes part in. A bar with a dead tab in it is
 * worse than a bar with four live ones. [D-21]
 *
 * TAKE PART IS THE RAISED ONE because it is the verb the whole
 * application is named for, and the uploaded design puts a camera
 * in it: `+` is what a page shows when it is about to ask you to
 * fill in a form, and this leads to pointing a phone at yourself.
 */
export default function BottomBar(
  { here }: {
    /**
     * Which tab the reader is standing on, so it can say so.
     *
     * A PAGE THAT IS NOT A TAB PASSES ITS OWN PATH and no tab is
     * marked, which is the truth: `/take/embed` is reached from
     * two of these and is none of them. Marking its parent would
     * tell a screen reader the reader is somewhere they are not.
     */
    here: '/take' | '/take/library' | '/take/profile' | '/take/embed';
  },
) {
  /*
   * `aria-current` IS ALSO WHAT COLOURS IT. One attribute says
   * where you are to a screen reader and to the stylesheet at
   * once; a second `className` for the same fact is a second
   * thing to forget. [D-19]
   */
  const on = (path: string) => (here === path ? 'page' : undefined);

  return (
    <nav className="tk-bottom" aria-label="Where to go" data-testid="take-bottom">
      <a className="tk-bottom-way" href="/take" aria-current={on('/take')}>
        <Icon name="home" size={19} />
        Home
      </a>
      {/*
        * "DISCOVER", WHICH IS WHAT THE DESTINATION ALREADY WAS.
        * `/tv` is the network's directory — every channel this
        * installation and its connections can see. "Watch"
        * described one thing you can do there; Discover says why
        * you would go.
        */}
      <a className="tk-bottom-way" href="/tv">
        <Icon name="search" size={19} />
        Discover
      </a>
      <a className="tk-bottom-go" href="/go">
        <span aria-hidden="true" className="tk-bottom-go-mark">
          <Icon name="camera" size={20} />
        </span>
        Take Part
      </a>
      <a className="tk-bottom-way" href="/take/library"
         aria-current={on('/take/library')}>
        <Icon name="library" size={19} />
        My Takes
      </a>
      <a className="tk-bottom-way" href="/take/profile"
         aria-current={on('/take/profile')}>
        <Icon name="person" size={19} />
        Profile
      </a>
    </nav>
  );
}
