// Every league the prototype covers. `path` is the ESPN site-API path segment.
// College scoreboards only list ranked teams unless a `groups` filter is given.
export const LEAGUES = {
  mlb: { name: 'MLB', sport: 'baseball', path: 'baseball/mlb' },
  nba: { name: 'NBA', sport: 'basketball', path: 'basketball/nba' },
  wnba: { name: 'WNBA', sport: 'basketball', path: 'basketball/wnba' },
  ncaam: { name: 'NCAAM', sport: 'basketball', path: 'basketball/mens-college-basketball', query: 'groups=50&limit=300' },
  ncaaw: { name: 'NCAAW', sport: 'basketball', path: 'basketball/womens-college-basketball', query: 'groups=50&limit=300' },
  nfl: { name: 'NFL', sport: 'football', path: 'football/nfl' },
  ncaaf: { name: 'NCAAF', sport: 'football', path: 'football/college-football', query: 'groups=80&limit=300' },
  nhl: { name: 'NHL', sport: 'hockey', path: 'hockey/nhl' },
  pwhl: { name: 'PWHL', sport: 'hockey', path: 'hockey/pwhl' },
  epl: { name: 'Premier League', sport: 'soccer', path: 'soccer/eng.1' },
  mls: { name: 'MLS', sport: 'soccer', path: 'soccer/usa.1' },
  nwsl: { name: 'NWSL', sport: 'soccer', path: 'soccer/usa.nwsl' },
  ucl: { name: 'Champions League', sport: 'soccer', path: 'soccer/uefa.champions' },
};

export function leagueList() {
  return Object.entries(LEAGUES).map(([key, l]) => ({ key, name: l.name, sport: l.sport }));
}
