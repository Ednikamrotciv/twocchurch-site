import React from "react";
import { Link, useRoute } from "../lib/router";
import { Btn, Icon, OPEN_SEARCH_EVENT, Section } from "../components/ui";
import { ct } from "../data/copy";

export function NotFound() {
  const { path } = useRoute();
  /* Shown as-is so a visitor can see (and tell the office about) the address
     that did not work. Long ones are trimmed so they cannot wreck the layout. */
  const asked = path.length > 80 ? path.slice(0, 80) + "…" : path;
  return (
    <Section className="notfound">
      <div className="notfound__inner">
        <span className="notfound__code">404</span>
        <h1>{ct("site.notFound.title")}</h1>
        <p className="lede">{ct("site.notFound.lede")}</p>
        <p className="notfound__asked">
          <Icon name="search" size={14} /> {ct("site.notFound.asked", { path: asked })}
        </p>
        <div className="btn-row center">
          <Btn icon="search" onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}>
            {ct("site.notFound.search")}</Btn>
          <Btn to="/" variant="ghost" icon="home">
            {ct("auto.site.bf8a7c7b528ae58a")}</Btn>
          <Btn to="/sermons" variant="ghost" icon="play">
            {ct("auto.site.5754a45b7973557a")}</Btn>
          <Btn to="/locations" variant="ghost" icon="compass">
            {ct("auto.site.e728fd0c478fea4d")}</Btn>
          <Btn to="/prayer" variant="crimson" icon="prayer">
            {ct("auto.site.9e9ec7c1bb846c50")}</Btn>
        </div>
        <div className="grid grid-4 mt-4">
          <Link className="mini-branch" to="/about"><span>📖</span><b>{ct("auto.site.50f0aac40fdc5c5d")}</b><em>{ct("auto.site.c3b13049e8443b90")}</em></Link>
          <Link className="mini-branch" to="/events"><span>📅</span><b>{ct("auto.site.2f667c7efb47ac5f")}</b><em>{ct("auto.site.2b48123430192ff5")}</em></Link>
          <Link className="mini-branch" to="/testimonies"><span>🙌</span><b>{ct("auto.site.1e21fe6b34543f72")}</b><em>{ct("auto.site.4e5382a560ff869c")}</em></Link>
          <Link className="mini-branch" to="/giving"><span>🎁</span><b>{ct("auto.site.99bc566546ff49fc")}</b><em>{ct("auto.site.2c1aedf375a9e382")}</em></Link>
        </div>
        <p className="muted mt-3">
          {ct("auto.site.70deb6d4a3b7bab5")}<Link to="/contact">{ct("auto.site.03af20cbe8691322")}</Link> {ct("auto.site.1c24c2c6f7c477ef")}</p>
      </div>
    </Section>
  );
}
