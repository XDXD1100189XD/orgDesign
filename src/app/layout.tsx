import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Org Design by the Numbers",
  description: "Menu Tech Portfolio — hierarchy analytics dashboard",
};

const extensionHydrationCleanupScript = `
(function () {
  var extensionAttributes = ["bis_skin_checked", "bis_register"];

  function shouldRemoveAttribute(name) {
    return (
      extensionAttributes.indexOf(name) !== -1 ||
      name.indexOf("__processed_") === 0
    );
  }

  function cleanElement(element) {
    if (!element || element.nodeType !== 1 || !element.attributes) {
      return;
    }

    for (var index = element.attributes.length - 1; index >= 0; index -= 1) {
      var attribute = element.attributes[index];

      if (shouldRemoveAttribute(attribute.name)) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  function cleanTree(root) {
    cleanElement(root);

    if (!root || !root.querySelectorAll) {
      return;
    }

    var descendants = root.querySelectorAll("*");

    for (var index = 0; index < descendants.length; index += 1) {
      cleanElement(descendants[index]);
    }
  }

  function cleanDocument() {
    cleanTree(document.documentElement);
  }

  cleanDocument();

  if (!("MutationObserver" in window)) {
    document.addEventListener("DOMContentLoaded", cleanDocument);
    return;
  }

  var observer = new MutationObserver(function (mutations) {
    for (var index = 0; index < mutations.length; index += 1) {
      var mutation = mutations[index];

      if (
        mutation.type === "attributes" &&
        mutation.attributeName &&
        shouldRemoveAttribute(mutation.attributeName)
      ) {
        cleanElement(mutation.target);
      }

      for (var nodeIndex = 0; nodeIndex < mutation.addedNodes.length; nodeIndex += 1) {
        cleanTree(mutation.addedNodes[nodeIndex]);
      }
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true
  });

  window.addEventListener("load", function () {
    cleanDocument();
    window.setTimeout(function () {
      observer.disconnect();
    }, 1000);
  });
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,800;1,9..144,400&family=JetBrains+Mono:wght@400;500;700&family=Inter+Tight:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{ __html: extensionHydrationCleanupScript }}
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
