import type { Href } from "expo-router";

/** Map an in-app link from the API (NotificationRecord.link) to a route in this app. */
export function routeForLink(link: string): Href | null {
  const path = link.split("?")[0].replace(/\/+$/, "") || "/";
  let m: RegExpMatchArray | null;
  if ((m = path.match(/^\/orders\/([^/]+)$/))) return { pathname: "/orders/[id]", params: { id: m[1] } };
  if (path === "/orders") return "/orders";
  if (path === "/selling") return "/selling";
  if (path === "/selling/orders") return "/selling/orders";
  if (path === "/bookings") return "/bookings";
  if (path === "/provider/bookings") return "/provider/bookings";
  if (path === "/provider/services") return "/provider/services";
  if ((m = path.match(/^\/events\/([^/]+)$/))) return { pathname: "/events/[id]", params: { id: m[1] } };
  if (path === "/events") return { pathname: "/social", params: { view: "events" } };
  if ((m = path.match(/^\/friends\/chat\/([^/]+)$/))) return { pathname: "/chat/[matchId]", params: { matchId: m[1] } };
  if (path === "/friends") return { pathname: "/social", params: { view: "friends" } };
  if ((m = path.match(/^\/parks\/([^/]+)$/))) return { pathname: "/parks/[id]", params: { id: m[1] } };
  if (path === "/parks") return { pathname: "/social", params: { view: "parks" } };
  if (path === "/cart") return "/cart";
  if (path === "/" || path === "/home") return "/";
  return null;
}
