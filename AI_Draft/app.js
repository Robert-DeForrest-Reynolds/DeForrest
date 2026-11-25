/* ==========================================================================
   DeForrest Compendium: application script
   Runs once at the end of <body>. Everything lives in one IIFE; sections are
   marked with "// ---------- Name ----------" comments, in this order:
   helpers, theme, Markdown renderer, tooltip annotation, edit overlay,
   document views, tooltips, navigation, search, location bar, jump points,
   zip download/upload, saving, section editing, document ingest, keyboard,
   palette, focus mode, highlights, tooltip editor, content graph, printing.
   Data comes from <script type="application/json"> blocks in index.html.
   ========================================================================== */
(function () {
    "use strict";
    var PRISTINE = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;

    var $ = function (s, r) {
        return (r || document).querySelector(s);
    };
    var $$ = function (s, r) {
        return Array.prototype.slice.call((r || document).querySelectorAll(s));
    };
    var reduced =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var store = {
        get: function (k, d) {
            try {
                var v = localStorage.getItem("dfc:" + k);
                return v == null ? d : JSON.parse(v);
            } catch (e) {
                return d;
            }
        },
        set: function (k, v) {
            try {
                localStorage.setItem("dfc:" + k, JSON.stringify(v));
            } catch (e) {}
        },
        del: function (k) {
            try {
                localStorage.removeItem("dfc:" + k);
            } catch (e) {}
        },
    };
    var sstore = {
        get: function (k, d) {
            try {
                var v = sessionStorage.getItem("dfc:" + k);
                return v == null ? d : JSON.parse(v);
            } catch (e) {
                return d;
            }
        },
        set: function (k, v) {
            try {
                sessionStorage.setItem("dfc:" + k, JSON.stringify(v));
            } catch (e) {}
        },
    };
    function escHTML(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
        });
    }
    var toastT;
    function toast(msg) {
        var t = $("#toast");
        t.textContent = msg;
        t.classList.add("show");
        clearTimeout(toastT);
        toastT = setTimeout(function () {
            t.classList.remove("show");
        }, 2800);
    }
    function copyText(text, okMsg) {
        var done = function () {
            toast(okMsg || "Copied");
        };
        function fallback() {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand("copy");
                done();
            } catch (e) {
                toast("Copy was blocked by the viewer");
            }
            document.body.removeChild(ta);
        }
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done, fallback);
                return;
            }
        } catch (e) {}
        fallback();
    }
    var docEl = $("#doc");
    var extHooks = {};

    // ---------- Theme ----------
    var themes = ["auto", "light", "dark"];
    var theme = store.get("theme", "auto");
    function applyTheme() {
        if (theme === "auto")
            document.documentElement.removeAttribute("data-theme");
        else document.documentElement.setAttribute("data-theme", theme);
        $("#themebtn").textContent = "Theme: " + theme;
    }
    applyTheme();

    // ---------- Markdown renderer (for uploaded documents) ----------
    function inlineMD(t, imgs) {
        var parts = t.split(/(`+[^`]*`+)/);
        return parts
            .map(function (seg, i) {
                if (i % 2 === 1)
                    return (
                        "<code>" +
                        escHTML(seg.replace(/^`+|`+$/g, "")) +
                        "</code>"
                    );
                var s = escHTML(seg);
                s = s
                    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
                    .replace(/\[\[([^\]]*)\]\]/g, "$1");
                s = s.replace(
                    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
                    function (_, alt, url) {
                        var src = resolveImg(url, imgs);
                        return src
                            ? '<img src="' + src + '" alt="' + alt + '">'
                            : '<a href="' +
                                  url +
                                  '" target="_blank" rel="noopener">' +
                                  (alt || url) +
                                  "</a>";
                    },
                );
                s = s.replace(
                    /\[([^\]]+)\]\(([^)\s]+)\)/g,
                    function (_, txt, url) {
                        return (
                            '<a href="' +
                            url +
                            '"' +
                            (url.charAt(0) === "#"
                                ? ""
                                : ' target="_blank" rel="noopener"') +
                            ">" +
                            txt +
                            "</a>"
                        );
                    },
                );
                s = s.replace(
                    /(^|[\s(])(https?:\/\/[^\s<]+)/g,
                    '$1<a href="$2" target="_blank" rel="noopener">$2</a>',
                );
                s = s
                    .replace(/\*\*\*([^*]+)\*\*\*/g, "<b><i>$1</i></b>")
                    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
                    .replace(/__([^_]+)__/g, "<b>$1</b>");
                s = s
                    .replace(
                        /(^|[^\w*])\*([^*\s][^*]*?)\*(?!\w)/g,
                        "$1<i>$2</i>",
                    )
                    .replace(/(^|[^\w])_([^_\s][^_]*?)_(?!\w)/g, "$1<i>$2</i>");
                s = s.replace(/&lt;(\/?)(u|sub|sup|br)&gt;/g, "<$1$2>");
                return s;
            })
            .join("");
    }
    function resolveImg(url, imgs) {
        if (!imgs) return null;
        var base = decodeURIComponent(
            url.split("/").pop().split("?")[0],
        ).toLowerCase();
        for (var k in imgs) {
            if (
                k.toLowerCase() === base ||
                k.toLowerCase().split("/").pop() === base
            )
                return imgs[k];
        }
        return /^data:/.test(url) ? url : null;
    }
    function renderMD(src, imgs) {
        var lines = src
            .replace(/\r\n?/g, "\n")
            .replace(/\t/g, "    ")
            .split("\n");
        var out = [],
            i = 0;
        function isTableSep(l) {
            return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
        }
        function cells(l) {
            return l
                .trim()
                .replace(/^\||\|$/g, "")
                .split(/(?<!\\)\|/)
                .map(function (c) {
                    return c.trim().replace(/\\\|/g, "|");
                });
        }
        function listBlock(start) {
            var items = [],
                j = start;
            while (j < lines.length) {
                var l = lines[j];
                var m = l.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
                if (m) {
                    items.push({
                        ind: m[1].length,
                        ord: /\d/.test(m[2]),
                        text: m[3],
                    });
                    j++;
                    continue;
                }
                if (l.trim() && /^\s{2,}/.test(l) && items.length) {
                    items[items.length - 1].text += " " + l.trim();
                    j++;
                    continue;
                }
                break;
            }
            function build(arr, k, ind) {
                var ord = arr[k].ord,
                    html = ord ? "<ol>" : "<ul>";
                while (k < arr.length && arr[k].ind >= ind) {
                    if (arr[k].ind > ind) {
                        var r = build(arr, k, arr[k].ind);
                        html = html.replace(/<\/li>$/, "") + r.html + "</li>";
                        k = r.k;
                        continue;
                    }
                    var tx = arr[k].text.replace(
                        /^\[( |x)\]\s+/i,
                        function (_, c) {
                            return c.trim() ? "☑ " : "☐ ";
                        },
                    );
                    html += "<li>" + inlineMD(tx, imgs) + "</li>";
                    k++;
                }
                return { html: html + (ord ? "</ol>" : "</ul>"), k: k };
            }
            return { html: build(items, 0, items[0].ind).html, next: j };
        }
        while (i < lines.length) {
            var line = lines[i];
            if (!line.trim()) {
                i++;
                continue;
            }
            var f = line.match(/^\s*(```+|~~~+)\s*([\w+-]*)/);
            if (f) {
                var buf = [],
                    fence = f[1];
                i++;
                while (
                    i < lines.length &&
                    lines[i].trim().indexOf(fence) !== 0
                ) {
                    buf.push(lines[i]);
                    i++;
                }
                i++;
                out.push(
                    '<div class="scroll"><pre' +
                        (f[2] ? ' data-lang="' + escHTML(f[2]) + '"' : "") +
                        "><code>" +
                        escHTML(buf.join("\n")) +
                        "</code></pre></div>",
                );
                continue;
            }
            var h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
            if (h) {
                var lv = Math.min(6, h[1].length + 2);
                out.push(
                    "<h" + lv + ">" + inlineMD(h[2], imgs) + "</h" + lv + ">",
                );
                i++;
                continue;
            }
            if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
                out.push("<hr>");
                i++;
                continue;
            }
            if (
                /^\s*\|/.test(line) &&
                i + 1 < lines.length &&
                isTableSep(lines[i + 1])
            ) {
                var hd = cells(line),
                    rows = [];
                i += 2;
                while (i < lines.length && /^\s*\|/.test(lines[i])) {
                    rows.push(cells(lines[i]));
                    i++;
                }
                out.push(
                    '<div class="scroll"><table><thead><tr>' +
                        hd
                            .map(function (c) {
                                return "<th>" + inlineMD(c, imgs) + "</th>";
                            })
                            .join("") +
                        "</tr></thead><tbody>" +
                        rows
                            .map(function (r) {
                                return (
                                    "<tr>" +
                                    r
                                        .map(function (c) {
                                            return (
                                                "<td>" +
                                                inlineMD(
                                                    c.replace(/<br>/g, " "),
                                                    imgs,
                                                ) +
                                                "</td>"
                                            );
                                        })
                                        .join("") +
                                    "</tr>"
                                );
                            })
                            .join("") +
                        "</tbody></table></div>",
                );
                continue;
            }
            if (/^\s*>/.test(line)) {
                var q = [];
                while (i < lines.length && /^\s*>/.test(lines[i])) {
                    q.push(lines[i].replace(/^\s*>\s?/, ""));
                    i++;
                }
                out.push(
                    "<blockquote>" +
                        renderMD(q.join("\n"), imgs) +
                        "</blockquote>",
                );
                continue;
            }
            if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
                var lb = listBlock(i);
                out.push(lb.html);
                i = lb.next;
                continue;
            }
            var p = [];
            while (
                i < lines.length &&
                lines[i].trim() &&
                !/^\s*(```|~~~|#{1,6}\s|>|\|)/.test(lines[i]) &&
                !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])
            ) {
                p.push(lines[i].trim());
                i++;
            }
            if (!p.length) {
                p.push(lines[i].trim());
                i++;
            }
            out.push(
                "<p>" +
                    inlineMD(p.join(" "), imgs).replace(/ {2,}/g, " ") +
                    "</p>",
            );
        }
        return out.join("\n");
    }

    // ---------- Tooltip annotation for uploaded documents ----------
    var TERMS = [];
    try {
        TERMS = JSON.parse($("#terms-data").textContent);
    } catch (e) {}
    var termRe = null;
    try {
        var ordered = TERMS.map(function (t, i) {
            return [t, i];
        }).sort(function (a, b) {
            return b[0][0].length - a[0][0].length;
        });
        var src = ordered
            .map(function (o) {
                var p = o[0][0];
                var pre = /^[\w.\[]/.test(p) ? "(?<![\\w.-])" : "";
                var post = /[\w\]\)?]$/.test(p) ? "(?![\\w])" : "";
                return "(?<t" + o[1] + ">" + pre + "(?:" + p + ")" + post + ")";
            })
            .join("|");
        termRe = new RegExp(src, "g");
    } catch (e) {
        termRe = null;
    }
    function annotate(scope) {
        if (!termRe) return;
        var seen = {};
        var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                var p = n.parentElement;
                if (
                    !p ||
                    p.closest(
                        "code,pre,a,script,style,svg,button,template,.tag",
                    )
                )
                    return NodeFilter.FILTER_REJECT;
                return n.nodeValue.trim()
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            },
        });
        var nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(function (n) {
            var s = n.nodeValue,
                last = 0,
                m,
                frag = document.createDocumentFragment(),
                any = false;
            var inHead = !!n.parentElement.closest("h1,h2,h3,h4,h5,h6");
            termRe.lastIndex = 0;
            while ((m = termRe.exec(s))) {
                var idx = -1;
                for (var g in m.groups) {
                    if (m.groups[g] !== undefined) {
                        idx = +g.slice(1);
                        break;
                    }
                }
                if (idx < 0) continue;
                any = true;
                var t = TERMS[idx];
                if (m.index > last)
                    frag.appendChild(
                        document.createTextNode(s.slice(last, m.index)),
                    );
                var el;
                if (inHead) {
                    el = document.createElement("span");
                    el.className = "gl";
                    el.tabIndex = 0;
                } else {
                    el = document.createElement("a");
                    el.href = "#" + t[1];
                    el.className = "xref term" + (seen[t[1]] ? " rep" : "");
                    seen[t[1]] = 1;
                }
                el.setAttribute("data-tip", t[2]);
                el.textContent = m[0];
                frag.appendChild(el);
                last = m.index + m[0].length;
            }
            if (!any) return;
            if (last < s.length)
                frag.appendChild(document.createTextNode(s.slice(last)));
            n.parentNode.replaceChild(frag, n);
        });
    }

    // ---------- Edit overlay (text edits + document uploads) ----------
    var editData = { version: 2, parts: {}, docs: {} };
    try {
        var ed = JSON.parse($("#edit-data").textContent);
        if (ed) {
            editData.parts = ed.parts || {};
            editData.docs = ed.docs || {};
            editData.highlights = ed.highlights || [];
            editData.terms = ed.terms || { added: [], edits: {} };
        }
    } catch (e) {}
    var drafts = store.get("drafts", {});
    var docDrafts = store.get("docdrafts", {});
    var cards = function () {
        return $$("article.dcard", docEl);
    };
    var originalBody = {}; // slug -> html of rendered view before replacement
    var originalRaw = {};

    function makeCardEl(slug, title, kicker, md, html, extraClass, tagsHTML) {
        var a = document.createElement("article");
        a.className = "dcard added" + (extraClass ? " " + extraClass : "");
        a.id = "d-" + slug;
        a.dataset.doc = slug;
        a.dataset.title = title;
        a.dataset.status = "mixed";
        a.innerHTML =
            '<header class="d-head"><button type="button" class="d-fold" data-act="dfold" aria-expanded="true" aria-label="Fold document">▾</button>' +
            '<div class="d-titles"><div class="d-kicker"></div><div class="d-title" role="heading" aria-level="2"></div></div><div class="d-tags">' +
            (tagsHTML || "") +
            "</div>" +
            '<div class="d-bar" role="toolbar"><div class="seg"><button type="button" class="segbtn on" data-act="view-rendered">Read</button><button type="button" class="segbtn" data-act="view-raw">Markdown</button></div>' +
            '<button type="button" class="tbtn" data-act="copy-raw">Copy</button><button type="button" class="tbtn" data-act="dl-doc">Download</button>' +
            '<button type="button" class="tbtn" data-act="replace-doc">Replace</button><button type="button" class="tbtn" data-act="add-after">Add after</button>' +
            '<button type="button" class="tbtn" data-act="pin-doc">Pin</button><button type="button" class="tbtn warn" data-act="remove-doc">Remove</button></div></header>' +
            '<div class="d-body"><div class="d-view d-rendered"></div><div class="d-view d-raw" hidden></div><template class="t-raw"><pre class="rawmd"></pre></template></div>';
        $(".d-kicker", a).textContent = kicker;
        $(".d-title", a).textContent = title;
        $(".d-rendered", a).innerHTML = html;
        $("template.t-raw", a).content.querySelector("pre").textContent = md;
        return a;
    }
    function wordsIn(md) {
        return (md.match(/\S+/g) || []).length;
    }
    function applyDocEntry(slug, e) {
        if (!e || e.remove) return;
        if (e.mode === "replace") {
            var card = $('article.dcard[data-doc="' + slug + '"]', docEl);
            if (!card) return;
            if (card.dataset.lazy) {
                fillLazy(card);
            }
            if (!(slug in originalBody)) {
                originalBody[slug] = $(".d-rendered", card).innerHTML;
                var t = $("template.t-raw", card);
                originalRaw[slug] = t ? t.content.textContent : "";
            }
            $(".d-rendered", card).innerHTML = renderMD(e.md, e.images);
            annotate($(".d-rendered", card));
            var tpl = $("template.t-raw", card);
            if (!tpl) {
                tpl = document.createElement("template");
                tpl.className = "t-raw";
                tpl.innerHTML = '<pre class="rawmd"></pre>';
                $(".d-body", card).appendChild(tpl);
            }
            tpl.content.querySelector("pre").textContent = e.md;
            card.dataset.replaced = "1";
            card.dataset.images = e.images ? Object.keys(e.images).length : 0;
            if (e.title) {
                card.dataset.title = e.title;
                $(".d-title", card).textContent = e.title;
            }
            $(".d-kicker", card).textContent =
                "Replaced · " +
                wordsIn(e.md).toLocaleString() +
                " words" +
                (e.file ? " · " + e.file : "");
            if (!$('[data-act="restore-doc"]', card)) {
                var b = document.createElement("button");
                b.type = "button";
                b.className = "tbtn warn";
                b.dataset.act = "restore-doc";
                b.textContent = "Restore original";
                $(".d-bar", card).appendChild(b);
            }
            showView(card, "rendered");
        } else if (e.mode === "new") {
            if ($('article.dcard[data-doc="' + slug + '"]', docEl)) return;
            var html = renderMD(e.md, e.images);
            var el = makeCardEl(
                slug,
                e.title,
                "Added · " +
                    wordsIn(e.md).toLocaleString() +
                    " words" +
                    (e.file ? " · " + e.file : ""),
                e.md,
                html,
                "",
                '<span class="tag add" data-tip="Added by upload; stored in the page overlay" tabindex="0">Added</span>',
            );
            el.dataset.images = e.images ? Object.keys(e.images).length : 0;
            var after =
                e.after &&
                $('article.dcard[data-doc="' + e.after + '"]', docEl);
            if (after) after.parentNode.insertBefore(el, after.nextSibling);
            else {
                var pa = $("#part-added");
                pa.hidden = false;
                pa.appendChild(el);
            }
            annotate($(".d-rendered", el));
        }
    }
    function docEntries() {
        var all = {};
        Object.keys(editData.docs).forEach(function (k) {
            all[k] = editData.docs[k];
        });
        Object.keys(docDrafts).forEach(function (k) {
            all[k] = docDrafts[k];
        });
        return all;
    }
    var allDocs = docEntries();
    Object.keys(allDocs).forEach(function (slug) {
        try {
            applyDocEntry(slug, allDocs[slug]);
        } catch (e) {
            console.error(e);
        }
    });

    (function addedToc() {
        var added = $$("article.dcard.added", docEl);
        if (!added.length) return;
        var box = document.createElement("div");
        box.className = "toc-part";
        box.innerHTML =
            '<a class="toc-ptitle" href="#part-added"><span>Added</span>Uploaded documents</a><ol></ol>';
        added.forEach(function (c) {
            var li = document.createElement("li");
            li.className = "toc-doc";
            var a = document.createElement("a");
            a.href = "#" + c.id;
            a.textContent = c.dataset.title;
            li.appendChild(a);
            $("ol", box).appendChild(li);
        });
        var toc = $(".toc");
        var last = toc.lastElementChild;
        toc.insertBefore(box, last);
    })();
    var parts = $$(".part", docEl);
    var editable = parts.filter(function (p) {
        return !p.closest("#part-v");
    });
    var origHTML = {};
    editable.forEach(function (p) {
        origHTML[p.dataset.pid] = p.innerHTML;
    });
    function partByPid(pid) {
        return editable.filter(function (p) {
            return p.dataset.pid === pid;
        })[0];
    }
    Object.keys(editData.parts || {}).forEach(function (pid) {
        var p = partByPid(pid);
        if (!p) return;
        p.innerHTML = editData.parts[pid].html;
        p.classList.add("edited");
    });
    Object.keys(drafts).forEach(function (pid) {
        var p = partByPid(pid);
        if (!p) {
            delete drafts[pid];
            return;
        }
        var c = editData.parts[pid];
        if (
            (c && !drafts[pid].revert && c.html === drafts[pid].html) ||
            (!c && drafts[pid].revert)
        ) {
            delete drafts[pid];
            return;
        }
        p.innerHTML = drafts[pid].revert ? origHTML[pid] : drafts[pid].html;
        p.classList.add("draft");
        if (drafts[pid].revert) p.classList.remove("edited");
    });
    Object.keys(docDrafts).forEach(function (k) {
        if (JSON.stringify(docDrafts[k]) === JSON.stringify(editData.docs[k]))
            delete docDrafts[k];
    });
    store.set("drafts", drafts);
    store.set("docdrafts", docDrafts);

    // ---------- Decorations ----------
    function decorate(scope) {
        $$("pre", scope).forEach(function (pre) {
            if (
                pre.querySelector(".copybtn") ||
                pre.closest("template") ||
                pre.classList.contains("rawmd")
            )
                return;
            var b = document.createElement("button");
            b.type = "button";
            b.className = "btn copybtn";
            b.textContent = "Copy";
            b.dataset.act = "copy-code";
            b.setAttribute("aria-label", "Copy code");
            pre.appendChild(b);
        });
        $$("h1 .hlink, h2 .hlink, h3 .hlink", scope).forEach(function (hl) {
            if (hl.parentNode.querySelector(".hpin")) return;
            var b = document.createElement("button");
            b.type = "button";
            b.className = "hpin";
            b.dataset.act = "pin-head";
            b.textContent = "pin";
            b.setAttribute("aria-label", "Pin this heading as a jump point");
            hl.parentNode.insertBefore(b, hl.nextSibling);
        });
    }
    decorate(docEl);
    function addEditBtn(p) {
        if (p.querySelector(":scope > .edit-btn")) return;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "btn edit-btn";
        b.textContent = "Edit section";
        b.dataset.act = "edit-part";
        p.insertBefore(b, p.firstChild);
    }
    editable.forEach(addEditBtn);

    // ---------- Document views ----------
    function fillLazy(card) {
        if (!card.dataset.lazy) return;
        var r = $(".d-rendered", card),
            t = $("template.t-rendered", card);
        if (r && t) {
            r.innerHTML = "";
            r.appendChild(t.content.cloneNode(true));
            decorate(r);
        }
        delete card.dataset.lazy;
        if (r && extHooks.onFill) extHooks.onFill(r);
        if (currentQuery) highlightIn(r);
    }
    function rawOf(card) {
        var t = $("template.t-raw", card);
        return t ? t.content.textContent : "";
    }
    function showView(card, mode) {
        var r = $(".d-rendered", card),
            w = $(".d-raw", card);
        if (!r || !w) return;
        if (mode === "raw") {
            if (!w.childNodes.length) {
                var t = $("template.t-raw", card);
                if (t) w.appendChild(t.content.cloneNode(true));
            } else {
                var pre = $("pre", w),
                    t2 = $("template.t-raw", card);
                if (pre && t2) pre.textContent = t2.content.textContent;
            }
            r.hidden = true;
            w.hidden = false;
        } else {
            fillLazy(card);
            r.hidden = false;
            w.hidden = true;
        }
        $$(".segbtn", card).forEach(function (b) {
            b.classList.toggle(
                "on",
                (b.dataset.act === "view-raw") === (mode === "raw"),
            );
        });
    }
    var foldedDocs = store.get("foldeddocs", null);
    function setDocFold(card, f) {
        card.classList.toggle("folded", f);
        var b = $(".d-fold", card);
        if (b) {
            b.setAttribute("aria-expanded", String(!f));
            b.setAttribute(
                "aria-label",
                f ? "Unfold document" : "Fold document",
            );
        }
        if (!f) fillLazy(card);
        store.set(
            "foldeddocs",
            cards()
                .filter(function (c) {
                    return c.classList.contains("folded");
                })
                .map(function (c) {
                    return c.dataset.doc;
                }),
        );
    }
    if (foldedDocs)
        cards().forEach(function (c) {
            c.classList.toggle(
                "folded",
                foldedDocs.indexOf(c.dataset.doc) >= 0,
            );
            if (!c.classList.contains("folded")) fillLazy(c);
        });

    // ---------- Tooltips ----------
    var tip = $("#tip"),
        tipT = null,
        tipFor = null;
    function showTip(el) {
        var text = el.getAttribute("data-tip");
        if (!text) return;
        tip.innerHTML = "";
        tip.appendChild(document.createTextNode(text));
        var href = el.getAttribute("href");
        if (href && href.charAt(0) === "#" && el.classList.contains("xref")) {
            var g = document.createElement("span");
            g.className = "go";
            g.textContent = "Click to jump · B to come back";
            tip.appendChild(g);
        }
        var r = el.getBoundingClientRect();
        tip.style.left = "0px";
        tip.style.top = "0px";
        tip.classList.add("show");
        var tw = tip.offsetWidth,
            th = tip.offsetHeight;
        var x = Math.min(
            Math.max(8, r.left + r.width / 2 - tw / 2),
            window.innerWidth - tw - 8,
        );
        var y = r.bottom + 8;
        if (y + th > window.innerHeight - 8) y = r.top - th - 8;
        tip.style.left = x + "px";
        tip.style.top = y + "px";
        tipFor = el;
    }
    function hideTip() {
        clearTimeout(tipT);
        tip.classList.remove("show");
        tipFor = null;
    }
    document.addEventListener("pointerover", function (e) {
        if (e.pointerType === "touch") return;
        var el = e.target.closest && e.target.closest("[data-tip]");
        if (!el || el === tipFor) return;
        clearTimeout(tipT);
        tipT = setTimeout(function () {
            showTip(el);
        }, 200);
    });
    document.addEventListener("pointerout", function (e) {
        var el = e.target.closest && e.target.closest("[data-tip]");
        if (el && (!e.relatedTarget || !el.contains(e.relatedTarget)))
            hideTip();
    });
    document.addEventListener("focusin", function (e) {
        var el = e.target.closest && e.target.closest("[data-tip]");
        if (el) showTip(el);
    });
    document.addEventListener("focusout", hideTip);
    window.addEventListener("scroll", hideTip, { passive: true });

    // ---------- Navigation ----------
    var backStack = [];
    function updateBack() {
        var b = $("#backbtn");
        b.classList.toggle("show", backStack.length > 0);
        b.textContent =
            "← Back" +
            (backStack.length > 1 ? " (" + backStack.length + ")" : "");
    }
    function reveal(el) {
        var card = el.closest("article.dcard");
        if (card && card.classList.contains("folded")) setDocFold(card, false);
        if (card) {
            var raw = $(".d-raw", card);
            if (raw && !raw.hidden && !raw.contains(el))
                showView(card, "rendered");
        }
        var sec = el.closest("section.chapter");
        if (sec && sec.classList.contains("folded")) setFold(sec, false);
        var det = el.closest("details");
        while (det) {
            det.open = true;
            det = det.parentElement && det.parentElement.closest("details");
        }
        var hidden = el.closest(".nostat, .nohit");
        if (hidden) {
            clearStatus();
            if (el.closest(".nohit")) {
                $("#opt-hide").checked = false;
                applyHide();
            }
        }
    }
    function jumpTo(id, push) {
        var el = document.getElementById(id);
        if (!el) {
            // target may live inside a folded original
            var lazy = $$("article.dcard[data-lazy]").filter(function (c) {
                var t = $("template.t-rendered", c);
                return (
                    t &&
                    t.content.getElementById &&
                    t.content.getElementById(id)
                );
            })[0];
            if (lazy) {
                setDocFold(lazy, false);
                el = document.getElementById(id);
            }
            if (!el) return false;
        }
        if (push !== false) {
            backStack.push(window.scrollY);
            if (backStack.length > 50) backStack.shift();
            updateBack();
        }
        reveal(el);
        el.scrollIntoView({
            behavior: reduced ? "auto" : "smooth",
            block: "start",
        });
        try {
            history.replaceState(null, "", "#" + id);
        } catch (e) {}
        var fl = el.tagName === "ARTICLE" ? $(".d-head", el) : el;
        fl.classList.remove("flash");
        void fl.offsetWidth;
        fl.classList.add("flash");
        return true;
    }
    function goBack() {
        if (!backStack.length) return;
        var y = backStack.pop();
        updateBack();
        window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
    }

    // ---------- Chapter folding inside documents ----------
    function setFold(sec, f) {
        sec.classList.toggle("folded", f);
        var b = sec.querySelector("h1 .fold");
        if (b) {
            b.setAttribute("aria-expanded", String(!f));
            b.setAttribute("aria-label", f ? "Unfold chapter" : "Fold chapter");
        }
    }

    // ---------- Status filter ----------
    var activeSt = [];
    function applyStatus() {
        $$("#statuschips .chipbtn").forEach(function (b) {
            b.setAttribute(
                "aria-pressed",
                String(activeSt.indexOf(b.dataset.st) >= 0),
            );
        });
        parts.forEach(function (p) {
            if (!activeSt.length) {
                p.classList.remove("nostat");
                return;
            }
            var st = (p.dataset.status || "").split(" ");
            p.classList.toggle(
                "nostat",
                !st.some(function (s) {
                    return activeSt.indexOf(s) >= 0;
                }),
            );
        });
        cards().forEach(function (c) {
            if (!activeSt.length) {
                c.classList.remove("nostat");
                return;
            }
            if (c.classList.contains("orig") || c.classList.contains("added")) {
                var st = (c.dataset.status || "").split(" ");
                c.classList.toggle(
                    "nostat",
                    !st.some(function (s) {
                        return activeSt.indexOf(s) >= 0;
                    }),
                );
                return;
            }
            c.classList.toggle(
                "nostat",
                !$$(".part", c).some(function (p) {
                    return !p.classList.contains("nostat");
                }),
            );
        });
        updateVis();
    }
    function clearStatus() {
        activeSt = [];
        applyStatus();
    }
    function updateVis() {
        $$("section.chapter", docEl).forEach(function (c) {
            var ps = $$(":scope > .part", c);
            c.classList.toggle(
                "nohit",
                ps.length > 0 &&
                    !ps.some(function (p) {
                        return (
                            !p.classList.contains("nostat") &&
                            !p.classList.contains("nohit")
                        );
                    }),
            );
        });
        $$(".lib-part", docEl).forEach(function (lp) {
            var cs = $$("article.dcard", lp);
            lp.classList.toggle(
                "nohit",
                cs.length > 0 &&
                    !cs.some(function (c) {
                        return (
                            !c.classList.contains("nostat") &&
                            !c.classList.contains("nohit")
                        );
                    }),
            );
        });
        $$(".toc a").forEach(function (a) {
            var t = document.getElementById(a.getAttribute("href").slice(1));
            a.classList.toggle("dim", !!(t && t.closest(".nohit, .nostat")));
        });
    }

    // ---------- Search ----------
    var currentQuery = "",
        hits = [],
        hitIdx = -1,
        qTimer;
    function escRe(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    function clearMarks(scope) {
        $$("mark.hit", scope || document).forEach(function (m) {
            var t = document.createTextNode(m.textContent);
            var p = m.parentNode;
            p.replaceChild(t, m);
            p.normalize();
        });
    }
    var SKIPSEL = "script,style,svg,template,textarea,button,.tag,#tip";
    function highlightIn(scope) {
        if (!currentQuery || !scope) return 0;
        var re = new RegExp(escRe(currentQuery), "gi");
        var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                re.lastIndex = 0;
                if (!n.nodeValue || !re.test(n.nodeValue)) {
                    return NodeFilter.FILTER_REJECT;
                }
                re.lastIndex = 0;
                var p = n.parentElement;
                if (!p || p.closest(SKIPSEL)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        var nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        var count = 0;
        nodes.forEach(function (n) {
            var s = n.nodeValue,
                last = 0,
                m,
                frag = document.createDocumentFragment();
            re.lastIndex = 0;
            while ((m = re.exec(s))) {
                if (m.index > last)
                    frag.appendChild(
                        document.createTextNode(s.slice(last, m.index)),
                    );
                var mk = document.createElement("mark");
                mk.className = "hit";
                mk.textContent = m[0];
                frag.appendChild(mk);
                last = m.index + m[0].length;
                count++;
                if (!m[0].length) re.lastIndex++;
            }
            if (last < s.length)
                frag.appendChild(document.createTextNode(s.slice(last)));
            n.parentNode.replaceChild(frag, n);
        });
        return count;
    }
    function applyHide() {
        var hide = $("#opt-hide").checked && !!currentQuery;
        parts.forEach(function (p) {
            p.classList.toggle("nohit", hide && !p.querySelector("mark.hit"));
        });
        cards().forEach(function (c) {
            if (!hide) {
                c.classList.remove("nohit");
                return;
            }
            if (c.classList.contains("orig") || !$(".part", c)) {
                c.classList.toggle(
                    "nohit",
                    !c.classList.contains("o-hit") &&
                        !c.querySelector("mark.hit"),
                );
                return;
            }
            c.classList.toggle("nohit", !c.querySelector("mark.hit"));
        });
        $$(".part-intro", docEl).forEach(function (p) {
            p.classList.toggle("nohit", hide && !p.querySelector("mark.hit"));
        });
        updateVis();
    }
    function runSearch() {
        var q = $("#q").value.trim();
        clearMarks(docEl);
        hits = [];
        hitIdx = -1;
        cards().forEach(function (c) {
            c.classList.remove("o-hit");
        });
        currentQuery = q.length >= 2 ? q : "";
        document.body.classList.toggle("searching", !!currentQuery);
        if (currentQuery) {
            var re = new RegExp(escRe(currentQuery), "i");
            cards().forEach(function (c) {
                var titleHit = re.test(c.dataset.title || "");
                if (c.classList.contains("orig")) {
                    if (titleHit) c.classList.add("o-hit");
                    if ($("#opt-orig").checked && re.test(rawOf(c))) {
                        c.classList.add("o-hit");
                        fillLazy(c);
                        highlightIn($(".d-rendered", c));
                    }
                    highlightIn($(".d-titles", c));
                } else {
                    highlightIn($(".d-titles", c));
                    highlightIn($(".d-rendered", c));
                }
            });
            $$(".part-intro", docEl).forEach(function (p) {
                highlightIn(p);
            });
            hits = $$("mark.hit", docEl);
        }
        applyHide();
        var secs = new Set(
            hits.map(function (h) {
                return h.closest(".part, article.dcard");
            }),
        );
        $("#qcount").textContent = currentQuery
            ? hits.length
                ? hits.length +
                  " matches in " +
                  secs.size +
                  " sections · Enter for next"
                : "No matches"
            : "";
    }
    function gotoHit(dir) {
        if (!hits.length) return;
        if (hitIdx >= 0 && hits[hitIdx]) hits[hitIdx].classList.remove("cur");
        hitIdx = (hitIdx + dir + hits.length) % hits.length;
        var h = hits[hitIdx];
        reveal(h);
        h.classList.add("cur");
        h.scrollIntoView({
            behavior: reduced ? "auto" : "smooth",
            block: "center",
        });
        $("#qcount").textContent =
            hitIdx + 1 + " of " + hits.length + " matches";
    }
    $("#q").addEventListener("input", function () {
        clearTimeout(qTimer);
        qTimer = setTimeout(runSearch, 160);
    });
    $("#q").addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            e.preventDefault();
            if (qTimer) {
                clearTimeout(qTimer);
                qTimer = null;
                if (currentQuery !== $("#q").value.trim()) runSearch();
            }
            gotoHit(e.shiftKey ? -1 : 1);
        }
        if (e.key === "Escape") {
            $("#q").value = "";
            runSearch();
            $("#q").blur();
        }
    });
    $("#opt-hide").addEventListener("change", applyHide);
    $("#opt-orig").addEventListener("change", runSearch);
    $("#prevhit").addEventListener("click", function () {
        gotoHit(-1);
    });
    $("#nexthit").addEventListener("click", function () {
        gotoHit(1);
    });

    // ---------- Location bar, progress, active contents ----------
    var tocLinks = {};
    $$(".toc a").forEach(function (a) {
        tocLinks[a.getAttribute("href").slice(1)] = a;
    });
    function headText(h) {
        var c = h.cloneNode(true);
        $$(".tag, .hlink, .hpin, .fold, button", c).forEach(function (x) {
            x.remove();
        });
        return c.textContent.trim();
    }
    function currentLocation() {
        var y = 140,
            card = null,
            h1 = null,
            h2 = null;
        var cs = cards().filter(function (c) {
            return c.offsetParent;
        });
        for (var i = 0; i < cs.length; i++) {
            if (cs[i].getBoundingClientRect().top <= y) card = cs[i];
            else break;
        }
        if (card && card.getBoundingClientRect().bottom < y) card = null;
        if (card) {
            var heads = $$(
                ".d-rendered section.chapter > h1, .d-rendered .part > h2",
                card,
            ).filter(function (h) {
                return h.offsetParent;
            });
            for (var j = 0; j < heads.length; j++) {
                var hh = heads[j];
                if (hh.getBoundingClientRect().top > y) break;
                if (hh.tagName === "H1") {
                    h1 = hh;
                    h2 = null;
                } else h2 = hh;
            }
        }
        return { card: card, h1: h1, h2: h2 };
    }
    var ticking = false;
    function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
            ticking = false;
            var loc = currentLocation(),
                cr = $("#crumbs");
            cr.innerHTML = "";
            if (loc.card) {
                var b = document.createElement("b");
                b.textContent = loc.card.dataset.title.replace(/^claude\//, "");
                cr.appendChild(b);
                if (loc.h1) {
                    cr.appendChild(document.createTextNode("  ›  "));
                    var it = document.createElement("i");
                    it.textContent = headText(loc.h1);
                    cr.appendChild(it);
                }
                if (loc.h2)
                    cr.appendChild(
                        document.createTextNode("  ›  " + headText(loc.h2)),
                    );
            } else cr.textContent = "DeForrest Compendium";
            $$(".toc a.active").forEach(function (a) {
                a.classList.remove("active");
            });
            $$(".toc-doc.open").forEach(function (li) {
                li.classList.remove("open");
            });
            if (loc.card && tocLinks[loc.card.id]) {
                tocLinks[loc.card.id].classList.add("active");
                var li = tocLinks[loc.card.id].parentNode;
                if (li.classList.contains("toc-doc")) li.classList.add("open");
            }
            [loc.h1, loc.h2].forEach(function (h) {
                if (h && tocLinks[h.id]) tocLinks[h.id].classList.add("active");
            });
            var max =
                document.documentElement.scrollHeight - window.innerHeight;
            $("#progress").style.width =
                (max > 0 ? (window.scrollY / max) * 100 : 0) + "%";
            $("#totop").classList.toggle(
                "show",
                window.scrollY > 900 &&
                    !$("#editbar").classList.contains("show"),
            );
        });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // ---------- Jump points ----------
    var pins = sstore.get("pins", []);
    function renderPins() {
        var ul = $("#pinlist");
        ul.innerHTML = "";
        if (!pins.length) {
            var e = document.createElement("li");
            e.className = "empty";
            e.textContent =
                "No jump points yet. Press P or use “Pin this spot”.";
            ul.appendChild(e);
        }
        pins.forEach(function (p, i) {
            var li = document.createElement("li");
            li.dataset.i = i;
            li.tabIndex = 0;
            li.innerHTML =
                '<span class="pl"></span><span class="ps"></span><button type="button" class="IconButton px" data-act="pin-remove" aria-label="Remove jump point">✕</button>';
            $(".pl", li).textContent = p.label;
            $(".ps", li).textContent = p.sub || "";
            ul.appendChild(li);
        });
        $("#pincount").textContent = pins.length ? pins.length : "";
        sstore.set("pins", pins);
    }
    function addPin(p) {
        pins.unshift(p);
        if (pins.length > 40) pins.pop();
        renderPins();
        if (!document.body.classList.contains("pins-open")) togglePins(true);
        toast("Pinned: " + p.label);
    }
    function pinHere() {
        var loc = currentLocation();
        var target = loc.h2 || loc.h1 || (loc.card && loc.card);
        var label = target
            ? target.tagName === "ARTICLE"
                ? target.dataset.title
                : headText(target)
            : "Top of page";
        var sub = loc.card
            ? loc.card.dataset.title.replace(/^claude\//, "")
            : "";
        if (sub === label) sub = "";
        addPin({
            id: target ? target.id : "",
            y: window.scrollY,
            label: label,
            sub:
                (sub ? sub + " · " : "") +
                "pinned " +
                new Date().toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                }),
        });
    }
    function togglePins(force) {
        var on =
            typeof force === "boolean"
                ? force
                : !document.body.classList.contains("pins-open");
        document.body.classList.toggle("pins-open", on);
        $("#pinsbtn").setAttribute("aria-pressed", String(on));
        $("#pinsbtn").classList.toggle("on", on);
        store.set("pinsopen", on);
    }
    renderPins();
    if (store.get("pinsopen", false)) togglePins(true);
    $("#pinlist").addEventListener("click", function (e) {
        if (e.target.closest('[data-act="pin-remove"]')) {
            var li0 = e.target.closest("li");
            pins.splice(+li0.dataset.i, 1);
            renderPins();
            return;
        }
        var li = e.target.closest("li[data-i]");
        if (!li) return;
        var p = pins[+li.dataset.i];
        if (p.id && document.getElementById(p.id)) jumpTo(p.id);
        else {
            backStack.push(window.scrollY);
            updateBack();
            window.scrollTo({
                top: p.y,
                behavior: reduced ? "auto" : "smooth",
            });
        }
    });
    $("#pinlist").addEventListener("keydown", function (e) {
        if (e.key === "Enter" && e.target.matches("li[data-i]"))
            e.target.click();
    });

    // ---------- Downloads: zip writer/reader ----------
    var CRC = (function () {
        var t = new Uint32Array(256);
        for (var n = 0; n < 256; n++) {
            var c = n;
            for (var k = 0; k < 8; k++)
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            t[n] = c >>> 0;
        }
        return t;
    })();
    function crc32(b) {
        var c = 0xffffffff;
        for (var i = 0; i < b.length; i++)
            c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    }
    function zipFiles(files) {
        var enc = new TextEncoder(),
            chunks = [],
            central = [],
            offset = 0;
        files.forEach(function (f) {
            var name = enc.encode(f.name),
                data = typeof f.data === "string" ? enc.encode(f.data) : f.data,
                crc = crc32(data);
            var h = new DataView(new ArrayBuffer(30));
            h.setUint32(0, 0x04034b50, true);
            h.setUint16(4, 20, true);
            h.setUint16(6, 0x0800, true);
            h.setUint16(8, 0, true);
            h.setUint16(10, 0, true);
            h.setUint16(12, 0x5821, true);
            h.setUint32(14, crc, true);
            h.setUint32(18, data.length, true);
            h.setUint32(22, data.length, true);
            h.setUint16(26, name.length, true);
            h.setUint16(28, 0, true);
            chunks.push(new Uint8Array(h.buffer), name, data);
            var c = new DataView(new ArrayBuffer(46));
            c.setUint32(0, 0x02014b50, true);
            c.setUint16(4, 20, true);
            c.setUint16(6, 20, true);
            c.setUint16(8, 0x0800, true);
            c.setUint16(10, 0, true);
            c.setUint16(12, 0, true);
            c.setUint16(14, 0x5821, true);
            c.setUint32(16, crc, true);
            c.setUint32(20, data.length, true);
            c.setUint32(24, data.length, true);
            c.setUint16(28, name.length, true);
            c.setUint32(42, offset, true);
            central.push(new Uint8Array(c.buffer), name);
            offset += 30 + name.length + data.length;
        });
        var csize = central.reduce(function (s, a) {
            return s + a.length;
        }, 0);
        var e = new DataView(new ArrayBuffer(22));
        e.setUint32(0, 0x06054b50, true);
        e.setUint16(8, files.length, true);
        e.setUint16(10, files.length, true);
        e.setUint32(12, csize, true);
        e.setUint32(16, offset, true);
        return new Blob(chunks.concat(central, [new Uint8Array(e.buffer)]), {
            type: "application/zip",
        });
    }
    async function unzip(buf) {
        var dv = new DataView(buf),
            u8 = new Uint8Array(buf),
            dec = new TextDecoder(),
            eocd = -1;
        for (
            var i = buf.byteLength - 22;
            i >= Math.max(0, buf.byteLength - 66000);
            i--
        ) {
            if (dv.getUint32(i, true) === 0x06054b50) {
                eocd = i;
                break;
            }
        }
        if (eocd < 0) throw new Error("Not a zip file");
        var n = dv.getUint16(eocd + 10, true),
            p = dv.getUint32(eocd + 16, true),
            out = [];
        for (var k = 0; k < n; k++) {
            var method = dv.getUint16(p + 10, true),
                csz = dv.getUint32(p + 20, true),
                nl = dv.getUint16(p + 28, true),
                el = dv.getUint16(p + 30, true),
                cl = dv.getUint16(p + 32, true),
                lo = dv.getUint32(p + 42, true);
            var name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
            var start =
                lo +
                30 +
                dv.getUint16(lo + 26, true) +
                dv.getUint16(lo + 28, true);
            var data = u8.slice(start, start + csz);
            if (method === 8) {
                if (typeof DecompressionStream === "undefined")
                    throw new Error(
                        "This browser cannot unpack compressed zips",
                    );
                data = new Uint8Array(
                    await new Response(
                        new Blob([data])
                            .stream()
                            .pipeThrough(
                                new DecompressionStream("deflate-raw"),
                            ),
                    ).arrayBuffer(),
                );
            }
            if (!/\/$/.test(name)) out.push({ name: name, data: data });
            p += 46 + nl + el + cl;
        }
        return out;
    }
    function svgFileFor(fig) {
        var svg = $("svg", fig).cloneNode(true);
        svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        var vb = (svg.getAttribute("viewBox") || "0 0 800 400").split(/\s+/);
        svg.setAttribute("width", vb[2]);
        svg.setAttribute("height", vb[3]);
        svg.removeAttribute("style");
        var st = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "style",
        );
        st.textContent = $("#svg-style").textContent;
        svg.insertBefore(st, svg.firstChild);
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
            new XMLSerializer().serializeToString(svg)
        );
    }
    function dataURLBytes(u) {
        var m = u.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
        if (!m) return new Uint8Array();
        if (m[2]) {
            var bin = atob(m[3]),
                a = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
            return a;
        }
        return new TextEncoder().encode(decodeURIComponent(m[3]));
    }
    var art = null,
        dl = null;
    function saveFile(name, data) {
        var blob =
            data instanceof Blob
                ? data
                : new Blob([data], {
                      type: /\.html$/.test(name) ? "text/html" : "text/plain",
                  });
        if (dl)
            return dl.save({ filename: name, data: blob }).then(
                function () {
                    toast("Download started: " + name);
                },
                function (er) {
                    if (!er || er.code !== "declined")
                        toast(
                            "Download unavailable here (" +
                                ((er && er.code) || "error") +
                                ")",
                        );
                },
            );
        try {
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = name;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                URL.revokeObjectURL(a.href);
                a.remove();
            }, 2000);
            toast("Download started: " + name);
        } catch (e) {
            toast("Downloads are blocked in this view");
        }
        return Promise.resolve();
    }
    function slugify(s) {
        return (
            (s || "document")
                .toLowerCase()
                .replace(/^claude\//, "")
                .replace(/\.(md|txt|markdown)$/, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "")
                .slice(0, 60) || "document"
        );
    }
    function downloadDoc(card) {
        var md = rawOf(card),
            base = slugify(card.dataset.title),
            files = [];
        var slug = card.dataset.doc,
            entry = allDocs[slug];
        if (entry && entry.images && Object.keys(entry.images).length) {
            Object.keys(entry.images).forEach(function (k) {
                files.push({
                    name: "images/" + k.split("/").pop(),
                    data: dataURLBytes(entry.images[k]),
                });
            });
        } else if (!card.dataset.replaced) {
            $$(".d-rendered figure[data-fig]", card).forEach(function (f) {
                files.push({
                    name: "images/" + f.dataset.fig + ".svg",
                    data: svgFileFor(f),
                });
            });
        }
        if (!files.length) return saveFile(base + ".md", md);
        files.unshift({ name: base + ".md", data: md });
        return saveFile(base + ".zip", zipFiles(files));
    }

    // ---------- Saving the page ----------
    function draftCount() {
        return (
            Object.keys(drafts).length +
            Object.keys(docDrafts).length +
            (extHooks.pending ? extHooks.pending() : 0)
        );
    }
    function buildHTML() {
        var p2 = JSON.parse(JSON.stringify(editData.parts || {}));
        Object.keys(drafts).forEach(function (pid) {
            if (drafts[pid].revert) delete p2[pid];
            else p2[pid] = { html: drafts[pid].html, at: drafts[pid].at };
        });
        var d2 = JSON.parse(JSON.stringify(editData.docs || {}));
        Object.keys(docDrafts).forEach(function (k) {
            if (docDrafts[k].remove) delete d2[k];
            else d2[k] = docDrafts[k];
        });
        var ex = extHooks.data
            ? extHooks.data()
            : {
                  highlights: editData.highlights || [],
                  terms: editData.terms || { added: [], edits: {} },
              };
        var json = JSON.stringify({
            version: 3,
            saved: new Date().toISOString(),
            parts: p2,
            docs: d2,
            highlights: ex.highlights,
            terms: ex.terms,
        }).replace(/</g, "\\u003c");
        return PRISTINE.replace(
            /(<script[^>]*\bid="edit-data"[^>]*>)[\s\S]*?(<\/script>)/,
            function (_, a, b) {
                return a + json + b;
            },
        );
    }
    function writeIntoPage() {
        if (!draftCount()) {
            toast("Nothing to write");
            return;
        }
        var html = buildHTML();
        if (!art) {
            refreshEditUI();
            toast(
                "Saved as a draft in this browser. Use “Download page” to keep it in the file.",
            );
            return;
        }
        var sp = drafts,
            sd = docDrafts;
        store.del("drafts");
        store.del("docdrafts");
        var ex0 = extHooks.data ? extHooks.data() : null;
        if (ex0) {
            editData.highlights = JSON.parse(JSON.stringify(ex0.highlights));
            editData.terms = JSON.parse(JSON.stringify(ex0.terms));
        }
        toast("Writing into the page…");
        art.publish(html).then(
            function () {
                toast("Written. Reloading…");
            },
            function (err) {
                var code = err && err.code;
                if (code === "conflict") {
                    toast(
                        "A newer version was saved elsewhere; reloading to it.",
                    );
                    return;
                }
                drafts = sp;
                docDrafts = sd;
                store.set("drafts", drafts);
                store.set("docdrafts", docDrafts);
                refreshEditUI();
                toast(
                    code === "not_granted" || code === "not_writer"
                        ? "You can view this page but not save it. Use Download page."
                        : "Writing failed" +
                              (code ? " (" + code + ")" : "") +
                              ". Your changes are kept as drafts.",
                );
            },
        );
    }
    function refreshEditUI() {
        var n = draftCount();
        $("#editpanel").classList.toggle("has-drafts", n > 0);
        $("#discardbtn").disabled = n === 0;
        $("#savebtn").disabled = n === 0;
        $("#savebtn").title = art
            ? ""
            : "Writing into the page works when this page is open on claude.ai; offline, use Download page.";
        var committed =
            Object.keys(editData.parts || {}).length +
            Object.keys(editData.docs || {}).length;
        $("#editstatus").textContent = n
            ? n +
              " unsaved change" +
              (n > 1 ? "s" : "") +
              " in this browser." +
              (committed ? " " + committed + " saved in the page." : "")
            : committed
              ? committed +
                " change" +
                (committed > 1 ? "s" : "") +
                " saved in the page."
              : "Edit text: choose “Edit section” on any section, change it, then press Done.";
        var ul = $("#editlist");
        ul.innerHTML = "";
        Object.keys(drafts).forEach(function (pid) {
            var li = document.createElement("li");
            var a = document.createElement("a");
            a.href = "#" + pid;
            a.className = "xref";
            var p = partByPid(pid),
                h = p && p.querySelector("h2");
            a.textContent =
                (h ? headText(h) : pid) +
                (drafts[pid].revert ? " (revert)" : "");
            li.appendChild(a);
            ul.appendChild(li);
        });
        if (extHooks.list)
            extHooks.list().forEach(function (s) {
                var li = document.createElement("li");
                li.textContent = s;
                ul.appendChild(li);
            });
        Object.keys(docDrafts).forEach(function (k) {
            var li = document.createElement("li");
            var e = docDrafts[k];
            li.textContent =
                (e.remove
                    ? "Remove: "
                    : e.mode === "replace"
                      ? "Replace: "
                      : "Add: ") + (e.title || k);
            ul.appendChild(li);
        });
    }

    // ---------- Section text editing ----------
    var editingPart = null,
        beforeEdit = null;
    function cleanHTML(p) {
        var c = p.cloneNode(true);
        $$("mark.hit", c).forEach(function (m) {
            m.replaceWith(document.createTextNode(m.textContent));
        });
        $$(".edit-btn, .copybtn, .hpin", c).forEach(function (b) {
            b.remove();
        });
        $$("mark.hl", c).forEach(function (m) {
            while (m.firstChild) m.parentNode.insertBefore(m.firstChild, m);
            m.remove();
        });
        $$("[data-cterm]", c).forEach(function (m) {
            m.replaceWith(document.createTextNode(m.textContent));
        });
        $$("[data-tip0]", c).forEach(function (m) {
            m.setAttribute("data-tip", m.getAttribute("data-tip0"));
            m.removeAttribute("data-tip0");
        });
        c.normalize();
        $$("[contenteditable]", c).forEach(function (x) {
            x.removeAttribute("contenteditable");
        });
        return c.innerHTML;
    }
    function startEdit(p) {
        if (editingPart) finishEdit(true);
        editingPart = p;
        beforeEdit = p.innerHTML;
        $$(".copybtn", p).forEach(function (b) {
            b.remove();
        });
        p.classList.add("is-editing");
        p.setAttribute("contenteditable", "true");
        var eb = p.querySelector(":scope > .edit-btn");
        if (eb) eb.setAttribute("contenteditable", "false");
        var h = p.querySelector("h2");
        $("#editbar-label").textContent =
            "Editing: " + (h ? headText(h) : "introduction");
        $("#editbar").classList.add("show");
        $("#totop").classList.remove("show");
        p.focus();
    }
    function finishEdit(save) {
        var p = editingPart;
        if (!p) return;
        p.removeAttribute("contenteditable");
        p.classList.remove("is-editing");
        var pid = p.dataset.pid;
        if (save) {
            var html = cleanHTML(p);
            var base =
                (editData.parts[pid] && editData.parts[pid].html) ||
                origHTML[pid];
            var d = document.createElement("div");
            d.innerHTML = base;
            $$(".edit-btn, .copybtn, .hpin", d).forEach(function (b) {
                b.remove();
            });
            if (html === d.innerHTML) {
                delete drafts[pid];
                p.classList.remove("draft");
            } else {
                drafts[pid] = { html: html, at: new Date().toISOString() };
                p.classList.add("draft");
            }
        } else p.innerHTML = beforeEdit;
        store.set("drafts", drafts);
        decorate(p);
        addEditBtn(p);
        editingPart = null;
        $("#editbar").classList.remove("show");
        refreshEditUI();
    }
    function revertPart() {
        var p = editingPart;
        if (!p) return;
        var pid = p.dataset.pid;
        p.innerHTML = origHTML[pid];
        p.removeAttribute("contenteditable");
        p.classList.remove("is-editing");
        if (editData.parts[pid]) {
            drafts[pid] = { revert: true, at: new Date().toISOString() };
            p.classList.add("draft");
            p.classList.remove("edited");
        } else {
            delete drafts[pid];
            p.classList.remove("draft");
        }
        store.set("drafts", drafts);
        decorate(p);
        addEditBtn(p);
        editingPart = null;
        $("#editbar").classList.remove("show");
        refreshEditUI();
        toast("Section reverted to the original text");
    }
    var discardArmed = false;
    function discard() {
        if (!discardArmed) {
            discardArmed = true;
            $("#discardbtn").textContent = "Click again to discard";
            setTimeout(function () {
                discardArmed = false;
                $("#discardbtn").textContent = "Discard unsaved";
            }, 3000);
            return;
        }
        store.del("drafts");
        store.del("docdrafts");
        store.del("highlights");
        store.del("customterms");
        toast("Unsaved changes discarded");
        setTimeout(function () {
            location.reload();
        }, 400);
    }
    function toggleEdit(force) {
        var on =
            typeof force === "boolean"
                ? force
                : !document.body.classList.contains("editing");
        if (!on && editingPart) finishEdit(true);
        document.body.classList.toggle("editing", on);
        $("#editbtn").classList.toggle("on", on);
        $("#editbtn").setAttribute("aria-pressed", String(on));
        refreshEditUI();
    }
    refreshEditUI();
    if (draftCount())
        toast(
            draftCount() +
                " unsaved change" +
                (draftCount() > 1 ? "s" : "") +
                " restored from this browser",
        );

    // ---------- Ingest: add or replace documents ----------
    var ingest = {
        mode: "new",
        target: null,
        after: null,
        md: null,
        images: {},
        file: "",
    };
    function openIngest(mode, target) {
        ingest = {
            mode: mode,
            target: target || null,
            after: mode === "new" ? target || null : null,
            md: null,
            images: {},
            file: "",
        };
        $("#ingest-title").textContent =
            mode === "replace"
                ? "Replace “" +
                  $('article.dcard[data-doc="' + target + '"]').dataset.title +
                  "”"
                : "Add a document";
        var sel = $("#ingest-place");
        sel.innerHTML = "";
        if (mode === "replace") {
            sel.innerHTML =
                '<option value="replace">In place of the current document</option>';
            sel.disabled = true;
        } else {
            sel.disabled = false;
            var o = document.createElement("option");
            o.value = "";
            o.textContent = "Added documents (before the session record)";
            sel.appendChild(o);
            cards()
                .filter(function (c) {
                    return !c.classList.contains("orig");
                })
                .forEach(function (c) {
                    var op = document.createElement("option");
                    op.value = c.dataset.doc;
                    op.textContent = "After: " + c.dataset.title;
                    sel.appendChild(op);
                });
            sel.value = ingest.after || "";
        }
        $("#ingest-name").value = "";
        $("#ingest-summary").innerHTML = "";
        $("#ingest-write").disabled = true;
        $("#ingest-draft").disabled = true;
        $("#ingest-note").textContent = art
            ? "“Write into page” saves a new version of this page and reloads it."
            : "Offline: the document is kept as a draft in this browser; use “Download page” afterwards to keep it in the file.";
        $("#ingest").classList.add("show");
        $("#dropzone").focus();
    }
    function readAs(file, how) {
        return new Promise(function (res, rej) {
            var r = new FileReader();
            r.onload = function () {
                res(r.result);
            };
            r.onerror = rej;
            r[how](file);
        });
    }
    var MIME = {
        svg: "image/svg+xml",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
    };
    function bytesToDataURL(bytes, ext) {
        var s = "";
        for (var i = 0; i < bytes.length; i += 0x8000)
            s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return (
            "data:" +
            (MIME[ext] || "application/octet-stream") +
            ";base64," +
            btoa(s)
        );
    }
    async function takeFiles(list) {
        var mdText = null,
            mdName = "",
            images = {};
        for (var i = 0; i < list.length; i++) {
            var f = list[i],
                ext = (f.name.split(".").pop() || "").toLowerCase();
            if (ext === "zip") {
                var entries = await unzip(await readAs(f, "readAsArrayBuffer"));
                entries.forEach(function (en) {
                    var e2 = (en.name.split(".").pop() || "").toLowerCase();
                    if (/^(md|markdown|txt)$/.test(e2) && mdText === null) {
                        mdText = new TextDecoder().decode(en.data);
                        mdName = en.name.split("/").pop();
                    } else if (MIME[e2])
                        images[en.name.split("/").pop()] = bytesToDataURL(
                            en.data,
                            e2,
                        );
                });
            } else if (/^(md|markdown|txt)$/.test(ext)) {
                if (mdText === null) {
                    mdText = await readAs(f, "readAsText");
                    mdName = f.name;
                }
            } else if (MIME[ext]) {
                images[f.name] = await readAs(f, "readAsDataURL");
            }
        }
        if (mdText === null && Object.keys(images).length && ingest.md) {
            Object.assign(ingest.images, images);
        } else if (mdText === null) {
            toast("No Markdown or text file found");
            return;
        } else {
            ingest.md = mdText;
            ingest.file = mdName;
            ingest.images = images;
        }
        var h = ingest.md.match(/^\s*#{1,3}\s+(.+?)\s*#*\s*$/m);
        if (!$("#ingest-name").value)
            $("#ingest-name").value = h
                ? h[1].replace(/\{#[^}]*\}|<[^>]+>/g, "").trim()
                : ingest.file.replace(/\.(md|markdown|txt)$/i, "");
        var refs = (ingest.md.match(/!\[[^\]]*\]\(([^)\s]+)/g) || []).map(
            function (r) {
                return r.replace(/^!\[[^\]]*\]\(/, "");
            },
        );
        var missing = refs.filter(function (u) {
            return !/^(https?:|data:)/.test(u) && !resolveImg(u, ingest.images);
        });
        $("#ingest-summary").innerHTML =
            "<div><b>" +
            escHTML(ingest.file) +
            "</b> · " +
            wordsIn(ingest.md).toLocaleString() +
            " words</div>" +
            "<div>" +
            Object.keys(ingest.images).length +
            " image" +
            (Object.keys(ingest.images).length === 1 ? "" : "s") +
            (Object.keys(ingest.images).length
                ? ": " +
                  Object.keys(ingest.images)
                      .map(function (k) {
                          return "<code>" + escHTML(k) + "</code>";
                      })
                      .join(" ")
                : "") +
            "</div>" +
            (missing.length
                ? '<div style="color:var(--flag)">Images referenced but not supplied: ' +
                  missing
                      .map(function (m) {
                          return "<code>" + escHTML(m) + "</code>";
                      })
                      .join(" ") +
                  ". Drop them here too.</div>"
                : "");
        $("#ingest-write").disabled = false;
        $("#ingest-draft").disabled = false;
    }
    function commitIngest(write) {
        if (!ingest.md) return;
        var title =
            $("#ingest-name").value.trim() ||
            ingest.file ||
            "Untitled document";
        var entry = {
            mode: ingest.mode === "replace" ? "replace" : "new",
            title: title,
            md: ingest.md,
            images: ingest.images,
            file: ingest.file,
            at: new Date().toISOString(),
        };
        var slug;
        if (entry.mode === "replace") slug = ingest.target;
        else {
            slug = "up-" + slugify(title) + "-" + Date.now().toString(36);
            entry.after = $("#ingest-place").value || null;
        }
        docDrafts[slug] = entry;
        store.set("docdrafts", docDrafts);
        allDocs = docEntries();
        applyDocEntry(slug, entry);
        parts = $$(".part", docEl);
        $("#ingest").classList.remove("show");
        refreshEditUI();
        var card = $('article.dcard[data-doc="' + slug + '"]');
        if (card) {
            decorate(card);
            if (window.__addDocMenu) window.__addDocMenu(card);
            if (extHooks.newCard) extHooks.newCard(card);
            jumpTo(card.id, true);
        }
        if (write) writeIntoPage();
        else
            toast(
                "Kept as a draft. Use “Write into page” or “Download page” to keep it.",
            );
    }
    var dz = $("#dropzone");
    dz.addEventListener("click", function () {
        $("#fileinput").click();
    });
    dz.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            $("#fileinput").click();
        }
    });
    dz.addEventListener("dragover", function (e) {
        e.preventDefault();
        dz.classList.add("over");
    });
    dz.addEventListener("dragleave", function () {
        dz.classList.remove("over");
    });
    dz.addEventListener("drop", function (e) {
        e.preventDefault();
        dz.classList.remove("over");
        takeFiles(Array.prototype.slice.call(e.dataTransfer.files)).catch(
            function (er) {
                toast("Could not read the files: " + er.message);
            },
        );
    });
    $("#fileinput").addEventListener("change", function () {
        takeFiles(Array.prototype.slice.call(this.files)).catch(function (er) {
            toast("Could not read the files: " + er.message);
        });
        this.value = "";
    });

    // ---------- Capabilities (claude.ai only) ----------
    if (window.claude && typeof window.claude.use === "function") {
        window.claude.use("artifact").then(
            function (a) {
                art = a;
                refreshEditUI();
            },
            function () {},
        );
        window.claude.use("downloads").then(
            function (d) {
                dl = d;
            },
            function () {},
        );
    }

    // ---------- Clicks ----------
    document.addEventListener("click", function (e) {
        var t = e.target;
        var inEdit = t.closest && t.closest('[contenteditable="true"]');
        var actEl = t.closest && t.closest("[data-act]");
        var card = t.closest && t.closest("article.dcard");
        if (!actEl && t.closest && t.closest(".d-title") && card) {
            setDocFold(card, !card.classList.contains("folded"));
            return;
        }
        if (actEl && !(inEdit && actEl.dataset.act !== "edit-part")) {
            switch (actEl.dataset.act) {
                case "copy-code": {
                    var pre = actEl.closest("pre");
                    var c = pre.cloneNode(true);
                    $$(".copybtn", c).forEach(function (b) {
                        b.remove();
                    });
                    copyText(c.textContent, "Code copied");
                    break;
                }
                case "copy-link": {
                    var id = actEl.dataset.id;
                    try {
                        history.replaceState(null, "", "#" + id);
                    } catch (er) {}
                    copyText(
                        location.href.split("#")[0] + "#" + id,
                        "Link copied",
                    );
                    break;
                }
                case "fold": {
                    var sec = actEl.closest("section.chapter");
                    setFold(sec, !sec.classList.contains("folded"));
                    break;
                }
                case "dfold":
                    setDocFold(card, !card.classList.contains("folded"));
                    break;
                case "fold-all":
                    cards().forEach(function (c) {
                        setDocFold(c, true);
                    });
                    break;
                case "unfold-all":
                    cards()
                        .filter(function (c) {
                            return !c.classList.contains("orig");
                        })
                        .forEach(function (c) {
                            setDocFold(c, false);
                        });
                    break;
                case "theme":
                    theme = themes[(themes.indexOf(theme) + 1) % 3];
                    store.set("theme", theme);
                    applyTheme();
                    break;
                case "help":
                    $("#help").classList.add("show");
                    break;
                case "help-close":
                    $("#help").classList.remove("show");
                    break;
                case "back":
                    goBack();
                    break;
                case "top":
                    backStack.push(window.scrollY);
                    updateBack();
                    window.scrollTo({
                        top: 0,
                        behavior: reduced ? "auto" : "smooth",
                    });
                    break;
                case "view-raw":
                    showView(card, "raw");
                    break;
                case "view-rendered":
                    showView(card, "rendered");
                    break;
                case "copy-raw":
                    copyText(rawOf(card), "Markdown copied");
                    break;
                case "dl-doc":
                    downloadDoc(card);
                    break;
                case "replace-doc":
                    openIngest("replace", card.dataset.doc);
                    break;
                case "add-after":
                    openIngest("new", card.dataset.doc);
                    break;
                case "add-doc":
                    openIngest("new", null);
                    break;
                case "restore-doc":
                    docDrafts[card.dataset.doc] = {
                        remove: true,
                        title: card.dataset.title,
                    };
                    store.set("docdrafts", docDrafts);
                    refreshEditUI();
                    toast("Original will be restored");
                    if (art) writeIntoPage();
                    else
                        setTimeout(function () {
                            location.reload();
                        }, 600);
                    break;
                case "remove-doc":
                    docDrafts[card.dataset.doc] = {
                        remove: true,
                        title: card.dataset.title,
                    };
                    store.set("docdrafts", docDrafts);
                    card.remove();
                    refreshEditUI();
                    toast("Document removed (unsaved)");
                    break;
                case "pin-doc":
                    addPin({
                        id: card.id,
                        y: window.scrollY,
                        label: card.dataset.title.replace(/^claude\//, ""),
                        sub:
                            "document · pinned " +
                            new Date().toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                            }),
                    });
                    break;
                case "pin-head": {
                    var h = actEl.closest("h1,h2,h3");
                    var cd = h.closest("article.dcard");
                    addPin({
                        id: h.id,
                        y: window.scrollY,
                        label: headText(h),
                        sub:
                            (cd
                                ? cd.dataset.title.replace(/^claude\//, "") +
                                  " · "
                                : "") +
                            "pinned " +
                            new Date().toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                            }),
                    });
                    break;
                }
                case "pin-here":
                    pinHere();
                    break;
                case "pins-toggle":
                    togglePins();
                    break;
                case "pins-clear":
                    pins = [];
                    renderPins();
                    break;
                case "ingest-write":
                    commitIngest(true);
                    break;
                case "ingest-draft":
                    commitIngest(false);
                    break;
                case "ingest-close":
                    $("#ingest").classList.remove("show");
                    break;
                case "edit-toggle":
                    toggleEdit();
                    break;
                case "edit-part":
                    if (!inEdit) {
                        e.preventDefault();
                        startEdit(actEl.closest(".part"));
                    }
                    break;
                case "edit-done":
                    finishEdit(true);
                    toast("Section updated (unsaved)");
                    break;
                case "edit-cancel":
                    finishEdit(false);
                    break;
                case "edit-revert":
                    revertPart();
                    break;
                case "save-version":
                    writeIntoPage();
                    break;
                case "download-html":
                    saveFile("DeForrest-Compendium.html", buildHTML());
                    break;
                case "copy-html":
                    copyText(buildHTML(), "Page HTML copied");
                    break;
                case "discard":
                    discard();
                    break;
                case "orig-open-all":
                    $$("#part-v article.dcard").forEach(function (c) {
                        setDocFold(c, false);
                    });
                    break;
                case "orig-close-all":
                    $$("#part-v article.dcard").forEach(function (c) {
                        setDocFold(c, true);
                    });
                    break;
            }
            return;
        }
        var a = t.closest && t.closest('a[href^="#"]');
        if (a) {
            if (inEdit) {
                e.preventDefault();
                return;
            }
            var hid = a.getAttribute("href").slice(1);
            if (hid && jumpTo(hid)) {
                e.preventDefault();
                hideTip();
            }
        }
    });
    $$("#statuschips .chipbtn").forEach(function (b) {
        b.addEventListener("click", function () {
            var s = b.dataset.st,
                i = activeSt.indexOf(s);
            if (i >= 0) activeSt.splice(i, 1);
            else activeSt.push(s);
            applyStatus();
        });
    });
    function toggleMenu() {}
    function _unusedToggleMenu(open) {
        var nav = $(".toc");
        var o =
            typeof open === "boolean" ? open : !nav.classList.contains("open");
        nav.classList.toggle("open", o);
        var b = $("#menu-btn");
        b.setAttribute("aria-expanded", String(o));
        b.textContent = o ? "Hide contents" : "Show contents";
    }
    $$(".modal").forEach(function (m) {
        m.addEventListener("click", function (e) {
            if (e.target === m) m.classList.remove("show");
        });
    });

    // ---------- Keyboard ----------
    function visibleCards() {
        return cards().filter(function (c) {
            return c.offsetParent;
        });
    }
    function currentCardIndex() {
        var cs = visibleCards(),
            idx = 0;
        for (var i = 0; i < cs.length; i++) {
            if (cs[i].getBoundingClientRect().top <= 140) idx = i;
        }
        return idx;
    }
    document.addEventListener("keydown", function (e) {
        var tag = (e.target.tagName || "").toLowerCase();
        var typing =
            tag === "input" ||
            tag === "textarea" ||
            tag === "select" ||
            e.target.isContentEditable;
        if (e.key === "Escape") {
            var open = $(".modal.show");
            if (open) {
                open.classList.remove("show");
                return;
            }
            if (editingPart) {
                finishEdit(false);
                return;
            }
            if (currentQuery && !typing) {
                $("#q").value = "";
                runSearch();
                return;
            }
        }
        if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
        var cs;
        switch (e.key) {
            case "/":
                e.preventDefault();
                ensureSearchBox();
                $("#q").focus();
                $("#q").select();
                break;
            case "n":
                gotoHit(1);
                break;
            case "N":
                gotoHit(-1);
                break;
            case "b":
            case "B":
                goBack();
                break;
            case "p":
            case "P":
                pinHere();
                break;
            case "j":
            case "J":
                togglePins();
                break;
            case "]":
                cs = visibleCards();
                var nx = cs[currentCardIndex() + 1];
                if (nx) jumpTo(nx.id, false);
                break;
            case "[":
                cs = visibleCards();
                var ci = currentCardIndex();
                var cur = cs[ci];
                var tgt =
                    cur && cur.getBoundingClientRect().top < 100
                        ? cur
                        : cs[ci - 1];
                if (tgt) jumpTo(tgt.id, false);
                break;
            case "f":
            case "F":
                cs = visibleCards();
                var cc = cs[currentCardIndex()];
                if (cc) setDocFold(cc, !cc.classList.contains("folded"));
                break;
            case "t":
            case "T":
                theme = themes[(themes.indexOf(theme) + 1) % 3];
                store.set("theme", theme);
                applyTheme();
                toast("Theme: " + theme);
                break;
            case "e":
            case "E":
                toggleEdit();
                toast(
                    document.body.classList.contains("editing")
                        ? "Text editing on"
                        : "Text editing off",
                );
                break;
            case "?":
                $("#help").classList.add("show");
                break;
        }
    });

    // ---------- Per-document contents menu ----------
    function addDocMenu(card) {
        if (card.classList.contains("orig") || $(".dmenu-wrap", card)) return;
        var heads = $$(
            ".d-rendered h1[id], .d-rendered h2[id], .d-rendered h3[id]",
            card,
        );
        if (heads.length < 3) return;
        var w = document.createElement("span");
        w.className = "dmenu-wrap";
        w.innerHTML =
            '<button type="button" class="tbtn" data-act="dmenu" aria-haspopup="true" aria-expanded="false">Contents ▾</button><div class="dmenu" role="menu"></div>';
        var m = $(".dmenu", w);
        heads.forEach(function (h) {
            var a = document.createElement("a");
            a.href = "#" + h.id;
            a.className =
                "l" + (h.tagName === "H1" ? 1 : h.tagName === "H2" ? 2 : 3);
            a.textContent = headText(h);
            m.appendChild(a);
        });
        var seg = $(".d-bar .seg", card);
        if (seg) seg.parentNode.insertBefore(w, seg.nextSibling);
        else $(".d-bar", card).appendChild(w);
    }
    cards().forEach(addDocMenu);
    window.__addDocMenu = addDocMenu;
    function closeMenus(except) {
        $$(".dmenu.show").forEach(function (m) {
            if (m !== except) {
                m.classList.remove("show");
                m.previousElementSibling.setAttribute("aria-expanded", "false");
            }
        });
    }
    document.addEventListener(
        "click",
        function (e) {
            var b = e.target.closest && e.target.closest('[data-act="dmenu"]');
            if (b) {
                var m = b.nextElementSibling;
                closeMenus(m);
                m.classList.toggle("show");
                b.setAttribute(
                    "aria-expanded",
                    String(m.classList.contains("show")),
                );
                e.stopPropagation();
                return;
            }
            if (!(e.target.closest && e.target.closest(".dmenu"))) closeMenus();
            else
                setTimeout(function () {
                    closeMenus();
                }, 0);
        },
        true,
    );

    // ---------- Command palette ----------
    var palItems = null,
        palSel = 0,
        palShown = [];
    function buildPal() {
        palItems = [];
        cards().forEach(function (c) {
            var orig = c.classList.contains("orig");
            palItems.push({
                k: orig ? "original" : "document",
                t: c.dataset.title.replace(/^claude\//, ""),
                s: ($(".d-kicker", c) || {}).textContent || "",
                id: c.id,
                w: orig ? 1 : 3,
            });
            if (orig) return;
            $$(
                ".d-rendered h1[id], .d-rendered h2[id], .d-rendered h3[id]",
                c,
            ).forEach(function (h) {
                palItems.push({
                    k: "section",
                    t: headText(h),
                    s: c.dataset.title,
                    id: h.id,
                    w: h.tagName === "H3" ? 1 : 2,
                });
            });
        });
        GLOSS.forEach(function (g) {
            palItems.push({
                k: "term",
                t: g[0],
                s: CT.edits[g[2]] != null ? CT.edits[g[2]] : g[2],
                id: g[1],
                w: 2,
            });
        });
        CT.added.forEach(function (c) {
            if (c.target)
                palItems.push({
                    k: "term",
                    t: c.label,
                    s: c.tip,
                    id: c.target,
                    w: 2,
                });
        });
    }
    function fuzzy(q, s) {
        s = s.toLowerCase();
        var i = s.indexOf(q);
        if (i >= 0)
            return {
                score:
                    100 -
                    Math.min(i, 50) +
                    (i === 0 ? 40 : 0) +
                    (s.length === q.length ? 30 : 0),
                hl: [[i, i + q.length]],
            };
        if (q.length < 4) return null;
        var pos = 0,
            hl = [],
            gaps = 0;
        for (var k = 0; k < q.length; k++) {
            var j = s.indexOf(q[k], pos);
            if (j < 0) return null;
            if (j > pos) gaps += j - pos;
            hl.push([j, j + 1]);
            pos = j + 1;
        }
        return gaps > q.length * 6 ? null : { score: 40 - gaps, hl: hl };
    }
    function markUp(text, hl) {
        var out = "",
            last = 0;
        (hl || []).forEach(function (r) {
            out +=
                escHTML(text.slice(last, r[0])) +
                "<mark>" +
                escHTML(text.slice(r[0], r[1])) +
                "</mark>";
            last = r[1];
        });
        return out + escHTML(text.slice(last));
    }
    function renderPal() {
        var q = $("#palq").value.trim().toLowerCase(),
            ul = $("#palres");
        ul.innerHTML = "";
        if (!palItems) buildPal();
        if (!q)
            palShown = palItems
                .filter(function (it) {
                    return it.k === "document";
                })
                .map(function (it) {
                    return { it: it, hl: null };
                });
        else
            palShown = palItems
                .map(function (it) {
                    var m = fuzzy(q, it.t);
                    return m
                        ? { it: it, hl: m.hl, sc: m.score + it.w * 6 }
                        : null;
                })
                .filter(Boolean)
                .sort(function (a, b) {
                    return b.sc - a.sc;
                })
                .slice(0, 60);
        palSel = 0;
        palShown.forEach(function (r, i) {
            var li = document.createElement("li");
            li.dataset.i = i;
            li.setAttribute("role", "option");
            li.innerHTML =
                '<span class="k">' +
                r.it.k +
                '</span><span class="t">' +
                markUp(r.it.t, r.hl) +
                '</span><span class="s"></span>';
            $(".s", li).textContent = r.it.s;
            ul.appendChild(li);
        });
        if (!palShown.length)
            ul.innerHTML =
                '<li style="display:block;color:var(--muted)">Nothing found. Press Enter to search the full text instead.</li>';
        selPal(0);
    }
    function selPal(i) {
        var lis = $$("#palres li[data-i]");
        if (!lis.length) return;
        palSel = (i + lis.length) % lis.length;
        lis.forEach(function (l, k) {
            l.classList.toggle("sel", k === palSel);
            l.setAttribute("aria-selected", String(k === palSel));
        });
        lis[palSel].scrollIntoView({ block: "nearest" });
    }
    function openPal() {
        $("#palette").classList.add("show");
        $("#palq").value = "";
        renderPal();
        setTimeout(function () {
            $("#palq").focus();
        }, 0);
    }
    function closePal() {
        $("#palette").classList.remove("show");
    }
    function choosePal(pin) {
        var r = palShown[palSel];
        if (!r) {
            var q = $("#palq").value.trim();
            closePal();
            if (q) {
                $("#q").value = q;
                runSearch();
                gotoHit(1);
            }
            return;
        }
        closePal();
        jumpTo(r.it.id);
        if (pin)
            addPin({
                id: r.it.id,
                y: window.scrollY,
                label: r.it.t,
                sub:
                    r.it.k +
                    " · pinned " +
                    new Date().toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                    }),
            });
    }
    $("#palq").addEventListener("input", renderPal);
    $("#palq").addEventListener("keydown", function (e) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            selPal(palSel + 1);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selPal(palSel - 1);
        } else if (e.key === "Enter") {
            e.preventDefault();
            choosePal(e.shiftKey);
        } else if (e.key === "Escape") {
            e.preventDefault();
            closePal();
        }
    });
    $("#palres").addEventListener("click", function (e) {
        var li = e.target.closest("li[data-i]");
        if (li) {
            palSel = +li.dataset.i;
            choosePal(false);
        }
    });
    $("#palres").addEventListener("mousemove", function (e) {
        var li = e.target.closest("li[data-i]");
        if (li && +li.dataset.i !== palSel) selPal(+li.dataset.i);
    });

    // ---------- Focused reading ----------
    function toggleFocus(force) {
        var on =
            typeof force === "boolean"
                ? force
                : !document.body.classList.contains("focus");
        var anchor = currentLocation(),
            aEl = anchor.h2 || anchor.h1 || anchor.card,
            off = aEl ? aEl.getBoundingClientRect().top : 0;
        document.body.classList.toggle("focus", on);
        $("#focusbtn").classList.toggle("on", on);
        $("#focusbtn").setAttribute("aria-pressed", String(on));
        if (aEl) window.scrollBy(0, aEl.getBoundingClientRect().top - off);
        store.set("focus", on);
    }
    if (store.get("focus", false)) toggleFocus(true);
    document.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest("[data-act]");
        if (!a) return;
        if (a.dataset.act === "palette") openPal();
        else if (a.dataset.act === "focus") toggleFocus();
        else if (a.dataset.act === "tab") setTab(a.dataset.tab);
    });
    document.addEventListener("keydown", function (e) {
        var tag = (e.target.tagName || "").toLowerCase(),
            typing =
                tag === "input" ||
                tag === "textarea" ||
                tag === "select" ||
                e.target.isContentEditable;
        if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
            e.preventDefault();
            if ($("#palette").classList.contains("show")) closePal();
            else openPal();
            return;
        }
        if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === "g" || e.key === "G") {
            e.preventDefault();
            openPal();
        } else if (e.key === "r" || e.key === "R") toggleFocus();
        else if (
            e.key === "Escape" &&
            document.body.classList.contains("focus") &&
            !$(".modal.show")
        )
            toggleFocus(false);
    });

    // ---------- Shared helpers (v6) ----------
    function jumpEl(el, push) {
        if (push !== false) {
            backStack.push(window.scrollY);
            if (backStack.length > 50) backStack.shift();
            updateBack();
        }
        reveal(el);
        el.scrollIntoView({
            behavior: reduced ? "auto" : "smooth",
            block: "center",
        });
        el.classList.remove("flash");
        void el.offsetWidth;
        el.classList.add("flash");
    }
    function openSidebarTab(name) {
        togglePins(true);
        setTab(name);
    }
    var NOTEXT =
        "script,style,svg,template,textarea,button,input,select,.d-head,.d-foot,.d-raw,.edit-btn,.dmenu-wrap,#tip";

    var GLOSS = [];
    try {
        GLOSS = JSON.parse($("#glossary-data").textContent);
    } catch (e) {}
    // ---------- Tooltips: data, edits, added terms ----------
    var CT =
        store.get("customterms", null) ||
        JSON.parse(JSON.stringify(editData.terms || { added: [], edits: {} }));
    CT.added = CT.added || [];
    CT.edits = CT.edits || {};
    function saveCT() {
        store.set("customterms", CT);
        palItems = null;
        refreshEditUI();
    }
    function applyTipEdits(scope) {
        $$("[data-tip]", scope || docEl).forEach(function (el) {
            var o = el.getAttribute("data-tip0") || el.getAttribute("data-tip");
            if (CT.edits[o] != null) {
                el.setAttribute("data-tip0", o);
                el.setAttribute("data-tip", CT.edits[o]);
            } else if (el.hasAttribute("data-tip0")) {
                el.setAttribute("data-tip", o);
                el.removeAttribute("data-tip0");
            }
        });
    }
    function escRe2(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    function customRe() {
        var list = CT.added
            .filter(function (t) {
                return t.label && t.label.trim();
            })
            .slice()
            .sort(function (a, b) {
                return b.label.length - a.label.length;
            });
        if (!list.length) return null;
        return {
            re: new RegExp(
                "(?<![\\w-])(" +
                    list
                        .map(function (t) {
                            return escRe2(t.label.trim());
                        })
                        .join("|") +
                    ")(?![\\w-])",
                "gi",
            ),
            list: list,
        };
    }
    function annotateCustom(scope) {
        var cr = customRe();
        if (!cr) return;
        var byLabel = {};
        cr.list.forEach(function (t) {
            byLabel[t.label.trim().toLowerCase()] = t;
        });
        var seenBy = new WeakMap();
        var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                var p = n.parentElement;
                if (
                    !p ||
                    p.closest(
                        "code,pre,a,.tag,.gl,[data-cterm],mark.hit,.toc," +
                            NOTEXT,
                    )
                )
                    return NodeFilter.FILTER_REJECT;
                cr.re.lastIndex = 0;
                return cr.re.test(n.nodeValue)
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            },
        });
        var nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(function (n) {
            var s = n.nodeValue,
                last = 0,
                m,
                frag = document.createDocumentFragment();
            var card = n.parentElement.closest("article.dcard") || docEl,
                seen = seenBy.get(card) || {};
            seenBy.set(card, seen);
            var inHead = !!n.parentElement.closest("h1,h2,h3,h4,h5,h6");
            cr.re.lastIndex = 0;
            while ((m = cr.re.exec(s))) {
                var t = byLabel[m[1].toLowerCase()];
                if (!t) continue;
                if (m.index > last)
                    frag.appendChild(
                        document.createTextNode(s.slice(last, m.index)),
                    );
                var el;
                if (t.target && !inHead) {
                    el = document.createElement("a");
                    el.href = "#" + t.target;
                    el.className =
                        "xref term custom-term" + (seen[t.id] ? " rep" : "");
                } else {
                    el = document.createElement("span");
                    el.className = "gl custom-term";
                    el.tabIndex = 0;
                }
                seen[t.id] = 1;
                el.setAttribute("data-cterm", t.id);
                el.setAttribute("data-tip", t.tip);
                el.textContent = m[0];
                frag.appendChild(el);
                last = m.index + m[0].length;
            }
            if (last < s.length)
                frag.appendChild(document.createTextNode(s.slice(last)));
            n.parentNode.replaceChild(frag, n);
        });
    }
    function unannotateCustom() {
        var parents = new Set();
        $$("[data-cterm]", docEl).forEach(function (el) {
            parents.add(el.parentNode);
            el.replaceWith(document.createTextNode(el.textContent));
        });
        parents.forEach(function (p) {
            p.normalize();
        });
    }
    function reapplyTerms() {
        unannotateCustom();
        annotateCustom(docEl);
        applyTipEdits(docEl);
        renderTerms();
    }

    // ---------- Highlights ----------
    var HL =
        store.get("highlights", null) ||
        JSON.parse(JSON.stringify(editData.highlights || []));
    function saveHL() {
        store.set("highlights", HL);
        renderHL();
        refreshEditUI();
    }
    function containerOf(node) {
        var el = node.nodeType === 1 ? node : node.parentElement;
        if (!el || !docEl.contains(el)) return null;
        var p = el.closest(".part[data-pid]");
        if (p) return { el: p, ref: "pid:" + p.dataset.pid };
        var a = el.closest("article.dcard");
        if (a) return { el: a, ref: "id:" + a.id };
        return null;
    }
    function resolveRef(ref) {
        if (ref.indexOf("pid:") === 0) {
            var pid = ref.slice(4);
            return (
                $$(".part[data-pid]", docEl).filter(function (p) {
                    return p.dataset.pid === pid;
                })[0] || null
            );
        }
        return document.getElementById(ref.slice(3));
    }
    function textNodesOf(cont) {
        var w = document.createTreeWalker(cont, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                var p = n.parentElement;
                return !p || p.closest(NOTEXT)
                    ? NodeFilter.FILTER_REJECT
                    : NodeFilter.FILTER_ACCEPT;
            },
        });
        var out = [];
        while (w.nextNode()) out.push(w.currentNode);
        return out;
    }
    function wrapSpan(nodes, s, e, h) {
        var acc = 0,
            marks = [],
            segs = [];
        nodes.forEach(function (t) {
            var len = t.nodeValue.length,
                a = Math.max(s, acc) - acc,
                b = Math.min(e, acc + len) - acc;
            if (b > a) segs.push([t, a, b]);
            acc += len;
        });
        segs.forEach(function (sg) {
            var t = sg[0],
                a = sg[1],
                b = sg[2],
                mid = t;
            if (!t.nodeValue.slice(a, b).trim()) return;
            if (/^(TR|TBODY|THEAD|TABLE|UL|OL)$/.test(t.parentNode.nodeName))
                return;
            if (a > 0) mid = t.splitText(a);
            if (b - a < mid.nodeValue.length) mid.splitText(b - a);
            var mk = document.createElement("mark");
            mk.className = "hl " + h.c + (h.note ? " noted" : "");
            mk.dataset.hl = h.id;
            if (h.note) mk.title = h.note;
            mid.parentNode.insertBefore(mk, mid);
            mk.appendChild(mid);
            marks.push(mk);
        });
        return marks;
    }
    function placeHL(h) {
        var cont = resolveRef(h.ref);
        if (!cont) return false;
        var card = cont.closest && cont.closest("article.dcard");
        if (card && card.dataset.lazy) fillLazy(card);
        var nodes = textNodesOf(cont),
            concat = nodes
                .map(function (n) {
                    return n.nodeValue;
                })
                .join("");
        var idx = -1,
            from = 0;
        for (var k = 0; k <= (h.occ || 0); k++) {
            var j = concat.indexOf(h.text, from);
            if (j < 0) break;
            idx = j;
            from = j + 1;
        }
        if (idx < 0) idx = concat.indexOf(h.text);
        if (idx < 0) return false;
        return wrapSpan(nodes, idx, idx + h.text.length, h).length > 0;
    }
    function removeMarks(id) {
        var ps = new Set();
        $$('mark.hl[data-hl="' + id + '"]').forEach(function (m) {
            ps.add(m.parentNode);
            while (m.firstChild) m.parentNode.insertBefore(m.firstChild, m);
            m.remove();
        });
        ps.forEach(function (p) {
            p.normalize();
        });
    }
    function labelFor(cont) {
        var card = cont.closest("article.dcard"),
            title = card
                ? card.dataset.title.replace(/^claude\//, "")
                : "Compendium";
        var h = cont.matches(".part")
            ? cont.querySelector(":scope > h2, :scope > h1")
            : null;
        return title + (h ? " › " + headText(h) : "");
    }
    function selectionInfo() {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
        var r = sel.getRangeAt(0);
        var c1 = containerOf(r.startContainer),
            c2 = containerOf(r.endContainer);
        if (!c1 || !c2) return null;
        var cont = c1;
        if (c1.el !== c2.el) {
            var a1 = c1.el.closest("article.dcard"),
                a2 = c2.el.closest("article.dcard");
            if (!a1 || a1 !== a2)
                return { err: "Highlights stay within one document" };
            cont = { el: a1, ref: "id:" + a1.id };
        }
        if (cont.el.closest('[contenteditable="true"]')) return null;
        var nodes = textNodesOf(cont.el),
            acc = 0,
            s = -1,
            e = -1;
        nodes.forEach(function (t) {
            var len = t.nodeValue.length;
            if (r.intersectsNode(t)) {
                var a = t === r.startContainer ? r.startOffset : 0,
                    b = t === r.endContainer ? r.endOffset : len;
                if (s < 0) s = acc + a;
                e = acc + b;
            }
            acc += len;
        });
        if (s < 0 || e <= s) return null;
        var concat = nodes
            .map(function (n) {
                return n.nodeValue;
            })
            .join("");
        while (s < e && /\s/.test(concat[s])) s++;
        while (e > s && /\s/.test(concat[e - 1])) e--;
        var text = concat.slice(s, e);
        if (!text) return null;
        var occ = 0,
            j = concat.indexOf(text);
        while (j >= 0 && j < s) {
            occ++;
            j = concat.indexOf(text, j + 1);
        }
        return {
            cont: cont,
            s: s,
            e: e,
            text: text,
            occ: occ,
            nodes: nodes,
            rect: r.getBoundingClientRect(),
        };
    }
    function createHL(color, withNote) {
        var info = selectionInfo();
        if (!info) return null;
        if (info.err) {
            toast(info.err);
            return null;
        }
        var h = {
            id:
                "h" +
                Date.now().toString(36) +
                Math.random().toString(36).slice(2, 5),
            ref: info.cont.ref,
            text: info.text,
            occ: info.occ,
            c: color || "y",
            note: "",
            at: new Date().toISOString(),
            label: labelFor(info.cont.el),
        };
        wrapSpan(info.nodes, info.s, info.e, h);
        HL.unshift(h);
        window.getSelection().removeAllRanges();
        hideSelbar();
        saveHL();
        if (withNote) {
            openSidebarTab("hl");
            openNote(h.id);
        } else toast("Highlighted · in the sidebar under Highlights");
        return h;
    }
    var hlFilter = "",
        noteOpen = null;
    function renderHL() {
        var ul = $("#hllist");
        ul.innerHTML = "";
        $("#hlcount").textContent = HL.length ? HL.length : "";
        var list = HL.filter(function (h) {
            return !hlFilter || h.c === hlFilter;
        });
        if (!list.length) {
            var e = document.createElement("li");
            e.className = "empty";
            e.textContent = HL.length
                ? "No highlights in this colour."
                : "No highlights yet. Select text in any document and pick a colour, or press H.";
            ul.appendChild(e);
            return;
        }
        list.forEach(function (h) {
            var li = document.createElement("li");
            li.className = h.c;
            li.dataset.hl = h.id;
            li.innerHTML =
                '<div class="q" title="Jump to this highlight"></div><div class="loc"></div>' +
                (h.note && noteOpen !== h.id
                    ? '<div class="note"></div>'
                    : "") +
                (noteOpen === h.id
                    ? '<textarea rows="3" placeholder="Write a note…"></textarea>'
                    : "") +
                '<div class="acts">' +
                (noteOpen === h.id
                    ? '<button type="button" data-hla="note-save">Save note</button><button type="button" data-hla="note-cancel">Cancel</button>'
                    : '<button type="button" data-hla="jump">Jump</button><button type="button" data-hla="note">' +
                      (h.note ? "Edit note" : "Note") +
                      '</button><button type="button" data-hla="copy">Copy</button>') +
                '<span style="flex:1"></span><button type="button" class="sw y" data-hla="c" data-c="y" aria-label="Yellow"></button><button type="button" class="sw g" data-hla="c" data-c="g" aria-label="Green"></button><button type="button" class="sw b" data-hla="c" data-c="b" aria-label="Blue"></button><button type="button" class="sw p" data-hla="c" data-c="p" aria-label="Pink"></button><button type="button" data-hla="del" aria-label="Remove highlight">✕</button></div>';
            $(".q", li).textContent = "“" + h.text + "”";
            $(".loc", li).textContent =
                h.label + (h.missing ? " · not found in the current text" : "");
            if ($(".note", li)) $(".note", li).textContent = h.note;
            if ($("textarea", li)) $("textarea", li).value = h.note || "";
            ul.appendChild(li);
        });
        if (noteOpen) {
            var ta = $('#hllist li[data-hl="' + noteOpen + '"] textarea');
            if (ta) ta.focus();
        }
    }
    function openNote(id) {
        noteOpen = id;
        renderHL();
    }
    function findHL(id) {
        return HL.filter(function (h) {
            return h.id === id;
        })[0];
    }
    function hlMarkdown() {
        return (
            "# DeForrest Compendium highlights\n\n" +
            HL.map(function (h) {
                return (
                    "> " +
                    h.text.replace(/\n/g, "\n> ") +
                    "\n\n— " +
                    h.label +
                    " (" +
                    { y: "yellow", g: "green", b: "blue", p: "pink" }[h.c] +
                    ")" +
                    (h.note ? "\n\nNote: " + h.note : "")
                );
            }).join("\n\n---\n\n") +
            "\n"
        );
    }
    $("#hllist").addEventListener("click", function (e) {
        var li = e.target.closest("li[data-hl]");
        if (!li) return;
        var h = findHL(li.dataset.hl);
        if (!h) return;
        var act = e.target.closest("[data-hla]");
        var a = act ? act.dataset.hla : e.target.closest(".q") ? "jump" : null;
        if (!a) return;
        if (a === "jump") {
            var m = $('mark.hl[data-hl="' + h.id + '"]');
            if (!m && placeHL(h)) m = $('mark.hl[data-hl="' + h.id + '"]');
            if (m) {
                jumpEl(m);
                $$('mark.hl[data-hl="' + h.id + '"]').forEach(function (x) {
                    x.classList.add("pulse");
                    setTimeout(function () {
                        x.classList.remove("pulse");
                    }, 1600);
                });
            } else toast("This passage is no longer in the text");
        } else if (a === "note") openNote(h.id);
        else if (a === "note-cancel") {
            noteOpen = null;
            renderHL();
        } else if (a === "note-save") {
            h.note = $("textarea", li).value.trim();
            noteOpen = null;
            $$('mark.hl[data-hl="' + h.id + '"]').forEach(function (x) {
                x.classList.toggle("noted", !!h.note);
                x.title = h.note || "";
            });
            saveHL();
        } else if (a === "copy")
            copyText(
                "> " +
                    h.text +
                    "\n\n— " +
                    h.label +
                    (h.note ? "\n\nNote: " + h.note : ""),
                "Highlight copied",
            );
        else if (a === "c") {
            h.c = act.dataset.c;
            $$('mark.hl[data-hl="' + h.id + '"]').forEach(function (x) {
                x.className = "hl " + h.c + (h.note ? " noted" : "");
            });
            saveHL();
        } else if (a === "del") {
            removeMarks(h.id);
            HL = HL.filter(function (x) {
                return x !== h;
            });
            saveHL();
        }
    });
    $$("#hlfilter .segbtn").forEach(function (b) {
        b.addEventListener("click", function () {
            hlFilter = b.dataset.hlf;
            $$("#hlfilter .segbtn").forEach(function (x) {
                x.classList.toggle("on", x === b);
            });
            renderHL();
        });
    });

    // selection toolbar
    var selbar = $("#selbar"),
        selTimer;
    function hideSelbar() {
        selbar.classList.remove("show");
    }
    function maybeSelbar() {
        var info = selectionInfo();
        if (!info || info.err || info.text.length < 2) {
            hideSelbar();
            return;
        }
        var r = info.rect;
        selbar.classList.add("show");
        var w = selbar.offsetWidth,
            x = Math.min(
                Math.max(8, r.left + r.width / 2 - w / 2),
                window.innerWidth - w - 8,
            ),
            y = r.top - selbar.offsetHeight - 10;
        if (y < 60) y = r.bottom + 10;
        selbar.style.left = x + "px";
        selbar.style.top = y + "px";
    }
    document.addEventListener("mouseup", function (e) {
        if (selbar.contains(e.target)) return;
        clearTimeout(selTimer);
        selTimer = setTimeout(maybeSelbar, 10);
    });
    document.addEventListener("keyup", function (e) {
        if (e.shiftKey || e.key === "Shift") {
            clearTimeout(selTimer);
            selTimer = setTimeout(maybeSelbar, 10);
        }
    });
    document.addEventListener("selectionchange", function () {
        var s = window.getSelection();
        if (!s || s.isCollapsed) hideSelbar();
    });
    window.addEventListener("scroll", hideSelbar, { passive: true });
    selbar.addEventListener("mousedown", function (e) {
        e.preventDefault();
    });
    selbar.addEventListener("click", function (e) {
        var c = e.target.closest("[data-hlc]");
        if (c) {
            createHL(c.dataset.hlc);
            return;
        }
        var b = e.target.closest("[data-sel]");
        if (!b) return;
        if (b.dataset.sel === "note") createHL("y", true);
        else if (b.dataset.sel === "copy") {
            var info = selectionInfo();
            if (info && info.text) copyText(info.text, "Copied");
            hideSelbar();
        } else if (b.dataset.sel === "tooltip") {
            var inf = selectionInfo();
            var txt =
                inf && inf.text
                    ? inf.text.replace(/\s+/g, " ").slice(0, 80)
                    : "";
            hideSelbar();
            window.getSelection().removeAllRanges();
            openSidebarTab("terms");
            openTermForm(null, txt);
        }
    });
    docEl.addEventListener("click", function (e) {
        var m = e.target.closest("mark.hl");
        if (!m || e.target.closest("a")) return;
        var s = window.getSelection();
        if (s && !s.isCollapsed) return;
        openSidebarTab("hl");
        hlFilter = "";
        $$("#hlfilter .segbtn").forEach(function (x) {
            x.classList.toggle("on", !x.dataset.hlf);
        });
        renderHL();
        var li = $('#hllist li[data-hl="' + m.dataset.hl + '"]');
        if (li) {
            li.scrollIntoView({ block: "nearest" });
            li.classList.remove("flash");
            void li.offsetWidth;
            li.classList.add("flash");
        }
    });

    // ---------- Tooltips tab ----------
    var termMode = "gloss",
        termEditing = null;
    function allTooltips() {
        var map = new Map();
        $$("[data-tip]", docEl).forEach(function (el) {
            if (el.closest("#pins, .d-bar, template, button, .hlink, .fold"))
                return;
            var tipv = el.getAttribute("data-tip"),
                key = el.getAttribute("data-tip0") || tipv;
            var g = map.get(key);
            if (!g) {
                g = { key: key, tip: tipv, els: [], samples: {} };
                map.set(key, g);
            }
            g.els.push(el);
            var w = el.textContent.trim().slice(0, 40);
            if (w) g.samples[w] = 1;
        });
        return Array.from(map.values()).sort(function (a, b) {
            return b.els.length - a.els.length;
        });
    }
    var tipCycle = {};
    function renderTerms() {
        var f = ($("#termfilter").value || "").trim().toLowerCase(),
            ul = $("#termlist");
        ul.innerHTML = "";
        var shown = 0,
            total = 0;
        function item(title, tipText, meta, cls, data) {
            var li = document.createElement("li");
            li.tabIndex = 0;
            if (cls) li.className = cls;
            Object.keys(data).forEach(function (k) {
                li.dataset[k] = data[k];
            });
            li.innerHTML =
                "<b></b><span></span>" +
                (meta ? '<span class="tmeta"></span>' : "") +
                '<button type="button" class="tedit" data-tact="edit">Edit</button>';
            $("b", li).textContent = title;
            $("span", li).textContent = tipText;
            if (meta) $(".tmeta", li).textContent = meta;
            ul.appendChild(li);
            shown++;
        }
        if (termMode === "gloss") {
            var entries = GLOSS.map(function (g, i) {
                return {
                    label: g[0],
                    target: g[1],
                    orig: g[2],
                    tip: CT.edits[g[2]] != null ? CT.edits[g[2]] : g[2],
                    kind: "g",
                    i: i,
                };
            })
                .concat(
                    CT.added.map(function (t) {
                        return {
                            label: t.label,
                            target: t.target,
                            orig: null,
                            tip: t.tip,
                            kind: "c",
                            id: t.id,
                        };
                    }),
                )
                .sort(function (a, b) {
                    return a.label
                        .toLowerCase()
                        .replace(/^[^a-z0-9]+/, "")
                        .localeCompare(
                            b.label.toLowerCase().replace(/^[^a-z0-9]+/, ""),
                        );
                });
            total = entries.length;
            var letter = "";
            entries.forEach(function (en) {
                if (
                    f &&
                    en.label.toLowerCase().indexOf(f) < 0 &&
                    en.tip.toLowerCase().indexOf(f) < 0
                )
                    return;
                var L = (
                    en.label.replace(/^[^A-Za-z0-9]+/, "").charAt(0) || "#"
                ).toUpperCase();
                if (!f && L !== letter) {
                    letter = L;
                    var hl = document.createElement("li");
                    hl.className = "termletter";
                    hl.textContent = L;
                    ul.appendChild(hl);
                }
                item(
                    en.label,
                    en.tip,
                    "",
                    en.kind === "c"
                        ? "custom"
                        : CT.edits[en.orig] != null
                          ? "edited"
                          : "",
                    en.kind === "c" ? { cid: en.id } : { gi: en.i },
                );
            });
            $("#termcount").textContent =
                shown +
                " of " +
                total +
                " defined terms · click one to jump to its definition";
        } else {
            var all = allTooltips();
            total = all.length;
            all.forEach(function (g, i) {
                var words = Object.keys(g.samples).slice(0, 4).join(" · ");
                if (
                    f &&
                    g.tip.toLowerCase().indexOf(f) < 0 &&
                    words.toLowerCase().indexOf(f) < 0
                )
                    return;
                item(
                    words || "(no text)",
                    g.tip,
                    g.els.length + " on the page · click to step through",
                    CT.edits[g.key] != null
                        ? "edited"
                        : g.els[0].hasAttribute("data-cterm")
                          ? "custom"
                          : "",
                    { ti: i, key: g.key },
                );
            });
            renderTerms._all = all;
            $("#termcount").textContent =
                shown +
                " of " +
                total +
                " distinct tooltips in the loaded text (folded originals load when opened)";
        }
        if (!shown) {
            var e = document.createElement("li");
            e.className = "empty";
            e.textContent = "Nothing matches.";
            ul.appendChild(e);
        }
    }
    // section/document targets for the form
    var targetMap = null;
    function buildTargets() {
        targetMap = {};
        var dl = $("#tf-targets");
        dl.innerHTML = "";
        cards().forEach(function (c) {
            var add = function (label, id) {
                if (targetMap[label]) return;
                targetMap[label] = id;
                var o = document.createElement("option");
                o.value = label;
                dl.appendChild(o);
            };
            add(c.dataset.title.replace(/^claude\//, ""), c.id);
            if (!c.classList.contains("orig"))
                $$(
                    ".d-rendered h1[id], .d-rendered h2[id], .d-rendered h3[id]",
                    c,
                ).forEach(function (h) {
                    add(headText(h), h.id);
                });
        });
    }
    function labelForTarget(id) {
        if (!targetMap) buildTargets();
        for (var k in targetMap) if (targetMap[k] === id) return k;
        return id ? "#" + id : "";
    }
    function openTermForm(entry, presetLabel) {
        if (!targetMap) buildTargets();
        termEditing = entry;
        var fm = $("#termform");
        fm.hidden = false;
        var isG = entry && entry.kind === "g",
            isC = entry && entry.kind === "c";
        $("#tf-title").textContent = entry
            ? isC
                ? "Edit added tooltip"
                : "Edit tooltip"
            : "New tooltip";
        $("#tf-label").value = entry ? entry.label : presetLabel || "";
        $("#tf-label").disabled = !!(entry && !isC);
        $("#tf-tip").value = entry ? entry.tip : "";
        $("#tf-target-wrap").hidden = !!(entry && !isC);
        $("#tf-target").value = isC ? labelForTarget(entry.target) : "";
        $("#tf-delete").hidden = !isC;
        $("#tf-reset").hidden = !(
            entry &&
            !isC &&
            CT.edits[entry.orig] != null
        );
        (entry && !isC ? $("#tf-tip") : $("#tf-label")).focus();
        if (!entry && presetLabel) $("#tf-tip").focus();
    }
    function closeTermForm() {
        $("#termform").hidden = true;
        termEditing = null;
    }
    $("#termform").addEventListener("submit", function (e) {
        e.preventDefault();
        var tip = $("#tf-tip").value.trim();
        if (!tip) return;
        var en = termEditing;
        if (en && en.kind !== "c") {
            if (tip === en.orig) delete CT.edits[en.orig];
            else CT.edits[en.orig] = tip;
        } else {
            var label = $("#tf-label").value.trim();
            if (!label) return;
            var tv = $("#tf-target").value.trim(),
                target = tv
                    ? targetMap[tv] || (tv.charAt(0) === "#" ? tv.slice(1) : "")
                    : "";
            if (target && !document.getElementById(target)) target = "";
            if (en) {
                en.ref.label = label;
                en.ref.tip = tip;
                en.ref.target = target;
            } else
                CT.added.push({
                    id: "c" + Date.now().toString(36),
                    label: label,
                    tip: tip,
                    target: target,
                    at: new Date().toISOString(),
                });
        }
        closeTermForm();
        saveCT();
        reapplyTerms();
        toast("Tooltip saved · applied across the page");
    });
    $("#termlist").addEventListener("click", function (e) {
        var li = e.target.closest("li[data-gi], li[data-cid], li[data-ti]");
        if (!li) return;
        var edit = !!e.target.closest('[data-tact="edit"]');
        if (li.dataset.gi != null) {
            var g = GLOSS[+li.dataset.gi];
            if (edit)
                openTermForm({
                    kind: "g",
                    label: g[0],
                    orig: g[2],
                    tip: CT.edits[g[2]] != null ? CT.edits[g[2]] : g[2],
                });
            else {
                if (document.activeElement) document.activeElement.blur();
                jumpTo(g[1]);
            }
        } else if (li.dataset.cid != null) {
            var t = CT.added.filter(function (x) {
                return x.id === li.dataset.cid;
            })[0];
            if (!t) return;
            if (edit)
                openTermForm({
                    kind: "c",
                    label: t.label,
                    tip: t.tip,
                    target: t.target,
                    ref: t,
                });
            else {
                var first = $('[data-cterm="' + t.id + '"]', docEl);
                if (t.target) jumpTo(t.target);
                else if (first) jumpEl(first);
                else toast("“" + t.label + "” does not appear in the text yet");
            }
        } else {
            var all = renderTerms._all || [],
                gg = all[+li.dataset.ti];
            if (!gg) return;
            if (edit) {
                openTermForm({
                    kind: "x",
                    label: Object.keys(gg.samples)[0] || "(tooltip)",
                    orig: gg.key,
                    tip: gg.tip,
                });
                return;
            }
            var els = gg.els.filter(function (x) {
                return document.contains(x);
            });
            if (!els.length) return;
            var k =
                ((tipCycle[gg.key] == null ? -1 : tipCycle[gg.key]) + 1) %
                els.length;
            tipCycle[gg.key] = k;
            if (document.activeElement) document.activeElement.blur();
            jumpEl(els[k]);
            $(".tmeta", li).textContent =
                k + 1 + " of " + els.length + " · click for next";
        }
    });
    $("#termlist").addEventListener("keydown", function (e) {
        if (e.key === "Enter" && e.target.matches("li[tabindex]"))
            e.target.click();
    });
    $("#termfilter").addEventListener("input", renderTerms);
    $$("#termmode .segbtn").forEach(function (b) {
        b.addEventListener("click", function () {
            termMode = b.dataset.tm;
            $$("#termmode .segbtn").forEach(function (x) {
                x.classList.toggle("on", x === b);
            });
            renderTerms();
        });
    });
    function setTab(name) {
        $$(".pins .tabs button").forEach(function (b) {
            b.classList.toggle("on", b.dataset.tab === name);
        });
        $("#tab-pins").hidden = name !== "pins";
        $("#tab-hl").hidden = name !== "hl";
        $("#tab-terms").hidden = name !== "terms";
        if (name === "terms") renderTerms();
        if (name === "hl") renderHL();
        store.set("tab", name);
    }

    // ---------- Content graph ----------
    var G = { k: 1, x: 0, y: 0, nodes: [], edges: [], key: "" };
    var PARTCOL = {
        "part-i": "var(--g1)",
        "part-ii": "var(--g2)",
        "part-iii": "var(--g3)",
        "part-iv": "var(--g4)",
        "part-v": "var(--muted)",
        "part-vi": "var(--g6)",
        "part-added": "var(--g7)",
    };
    function rng(seed) {
        return function () {
            seed |= 0;
            seed = (seed + 0x6d2b79f5) | 0;
            var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function buildGraph() {
        var mode = $("#gmode .on").dataset.gm,
            withOrig = $("#g-orig").checked,
            key = mode + withOrig + cards().length;
        if (G.key === key) return;
        G.key = key;
        var nodes = [],
            idx = {},
            lazyIds = {};
        function add(n) {
            idx[n.id] = nodes.length;
            nodes.push(n);
        }
        cards().forEach(function (c) {
            var orig = c.classList.contains("orig");
            if (orig && !withOrig) return;
            var lp = c.closest(".lib-part, #part-added"),
                col = PARTCOL[lp ? lp.id : ""] || "var(--muted)";
            var w = orig
                ? rawOf(c).split(/\s+/).length
                : $(".d-rendered", c).textContent.length / 6;
            add({
                id: c.id,
                label: c.dataset.title
                    .replace(/^claude\//, "")
                    .replace(/\.md$/, ""),
                kind: orig ? "orig" : "doc",
                r: orig ? 5 : 6 + Math.sqrt(w) / 7,
                col: col,
                doc: c.id,
            });
            if (orig && c.dataset.lazy) {
                var tp = $("template.t-rendered", c);
                if (tp)
                    $$("[id]", tp.content).forEach(function (x) {
                        lazyIds[x.id] = c.id;
                    });
            }
            if (mode === "secs" && !orig)
                $$(".d-rendered .part > h2[id]", c).forEach(function (h) {
                    var pw = h.parentNode.textContent.length / 6;
                    add({
                        id: h.id,
                        label: headText(h),
                        kind: "sec",
                        r: 3 + Math.sqrt(pw) / 9,
                        col: col,
                        doc: c.id,
                    });
                });
        });
        function locate(el, fallbackCardId) {
            var card = el ? el.closest("article.dcard") : null,
                cid = card ? card.id : fallbackCardId;
            if (!cid) return null;
            if (mode === "secs" && el) {
                var p = el.closest(".part"),
                    h = p && p.querySelector(":scope > h2[id]");
                if (h && idx[h.id] != null) return h.id;
            }
            return idx[cid] != null ? cid : null;
        }
        var ew = {};
        cards().forEach(function (c) {
            if (idx[c.id] == null) return;
            $$('.d-rendered a[href^="#"]', c).forEach(function (a) {
                var id = a.getAttribute("href").slice(1);
                if (!id) return;
                var tgt = document.getElementById(id),
                    from = locate(a),
                    to = tgt
                        ? locate(tgt)
                        : lazyIds[id]
                          ? locate(null, lazyIds[id])
                          : null;
                if (!from || !to || from === to) return;
                if (
                    mode === "docs" &&
                    nodes[idx[from]].doc === nodes[idx[to]].doc
                )
                    return;
                var k = from < to ? from + "|" + to : to + "|" + from;
                ew[k] = (ew[k] || 0) + 1;
            });
        });
        var edges = Object.keys(ew).map(function (k) {
            var p = k.split("|");
            return { a: idx[p[0]], b: idx[p[1]], w: ew[k], mem: false };
        });
        if (mode === "secs")
            nodes.forEach(function (n, i) {
                if (n.kind === "sec")
                    edges.push({ a: i, b: idx[n.doc], w: 3, mem: true });
            });
        // layout: documents first (on document-level links), then sections clustered around their document
        var R = rng(7),
            W = 1400,
            H = 900;
        function force(list, elist, iters, kk, fixedFn, grav) {
            var N = list.length,
                temp = 80;
            for (var it = 0; it < iters; it++) {
                for (var i = 0; i < N; i++) {
                    list[i].dx = 0;
                    list[i].dy = 0;
                }
                for (i = 0; i < N; i++)
                    for (var j = i + 1; j < N; j++) {
                        var A = list[i],
                            B = list[j],
                            dx = A.x - B.x,
                            dy = A.y - B.y,
                            d = Math.sqrt(dx * dx + dy * dy) + 0.01;
                        if (d > kk * 4) continue;
                        var f = (kk * kk) / d,
                            fx = (dx / d) * f,
                            fy = (dy / d) * f;
                        A.dx += fx;
                        A.dy += fy;
                        B.dx -= fx;
                        B.dy -= fy;
                    }
                elist.forEach(function (e) {
                    var A = e.A,
                        B = e.B,
                        dx = A.x - B.x,
                        dy = A.y - B.y,
                        d = Math.sqrt(dx * dx + dy * dy) + 0.01;
                    var f = ((d * d) / kk) * e.s,
                        fx = (dx / d) * f,
                        fy = (dy / d) * f;
                    A.dx -= fx;
                    A.dy -= fy;
                    B.dx += fx;
                    B.dy += fy;
                });
                for (i = 0; i < N; i++) {
                    var n = list[i];
                    if (fixedFn && fixedFn(n)) continue;
                    if (grav) {
                        n.dx += (W / 2 - n.x) * grav;
                        n.dy += (H / 2 - n.y) * grav;
                    }
                    var dl = Math.sqrt(n.dx * n.dx + n.dy * n.dy) + 0.01,
                        lim = Math.min(dl, temp);
                    n.x += (n.dx / dl) * lim;
                    n.y += (n.dy / dl) * lim;
                }
                temp = Math.max(1.5, temp * 0.985);
            }
        }
        var hubs = nodes.filter(function (n) {
            return n.kind !== "sec";
        });
        hubs.forEach(function (n, i) {
            var a = (i / hubs.length) * Math.PI * 2;
            n.x = W / 2 + Math.cos(a) * 380 + R() * 20;
            n.y = H / 2 + Math.sin(a) * 300 + R() * 20;
        });
        var dw = {};
        edges.forEach(function (e) {
            var a = nodes[idx[nodes[e.a].doc]] || nodes[e.a],
                b = nodes[idx[nodes[e.b].doc]] || nodes[e.b];
            if (a === b) return;
            var k = a.id < b.id ? a.id + "|" + b.id : b.id + "|" + a.id;
            dw[k] = dw[k] || { A: a, B: b, w: 0 };
            dw[k].w += e.w;
        });
        var hubEdges = Object.keys(dw).map(function (k) {
            var e = dw[k];
            return {
                A: e.A,
                B: e.B,
                s: Math.min(1 + Math.log(e.w) * 0.35, 2.2),
            };
        });
        var spread = mode === "secs" ? 1.9 : 1;
        force(
            hubs,
            hubEdges,
            320,
            Math.sqrt((W * H) / Math.max(hubs.length, 1)) * 0.85 * spread,
            null,
            mode === "secs" ? 0.025 : 0.06,
        );
        if (mode === "secs") {
            var secsBy = {};
            nodes.forEach(function (n) {
                if (n.kind === "sec")
                    (secsBy[n.doc] = secsBy[n.doc] || []).push(n);
            });
            Object.keys(secsBy).forEach(function (d) {
                var hub = nodes[idx[d]],
                    ss = secsBy[d];
                ss.forEach(function (s, i) {
                    var a = (i / ss.length) * Math.PI * 2,
                        rr = 50 + 6 * Math.sqrt(ss.length);
                    s.x = hub.x + Math.cos(a) * rr;
                    s.y = hub.y + Math.sin(a) * rr;
                });
            });
            var se = edges.map(function (e) {
                return { A: nodes[e.a], B: nodes[e.b], s: e.mem ? 2.2 : 0.05 };
            });
            force(
                nodes,
                se,
                160,
                34,
                function (n) {
                    return n.kind !== "sec";
                },
                0,
            );
        }
        G.nodes = nodes;
        G.edges = edges;
        G.adj = nodes.map(function () {
            return [];
        });
        edges.forEach(function (e, k) {
            G.adj[e.a].push([e.b, k]);
            G.adj[e.b].push([e.a, k]);
        });
        drawGraph();
        var linkN = edges.filter(function (e) {
            return !e.mem;
        }).length;
        $("#gstat").textContent =
            nodes.length + " nodes · " + linkN + " cross-link connections";
        var parts = {};
        $$(".lib-part, #part-added").forEach(function (lp) {
            if (lp.hidden && lp.id === "part-added") return;
            var t = $(".part-title", lp);
            parts[lp.id] = t ? t.textContent : "Added documents";
        });
        $("#glegend").innerHTML = Object.keys(parts)
            .filter(function (k) {
                return k !== "part-v" || withOrig;
            })
            .map(function (k) {
                return (
                    '<span><i style="background:' +
                    PARTCOL[k] +
                    '"></i>' +
                    escHTML(parts[k]) +
                    "</span>"
                );
            })
            .join("");
    }
    var SVGNS = "http://www.w3.org/2000/svg";
    function drawGraph() {
        var ge = $("#gedges"),
            gn = $("#gnodes");
        ge.innerHTML = "";
        gn.innerHTML = "";
        G.edges.forEach(function (e, k) {
            var l = document.createElementNS(SVGNS, "line");
            l.setAttribute(
                "stroke-width",
                e.mem ? 1 : Math.min(1 + Math.log(e.w) * 0.9, 4),
            );
            l.setAttribute("opacity", e.mem ? 0.35 : 0.55);
            if (e.mem) l.setAttribute("class", "mem");
            e.el = l;
            ge.appendChild(l);
        });
        G.nodes.forEach(function (n, i) {
            var g = document.createElementNS(SVGNS, "g");
            g.setAttribute("class", "gn " + n.kind);
            g.dataset.i = i;
            var c = document.createElementNS(SVGNS, "circle");
            c.setAttribute("r", n.r.toFixed(1));
            c.setAttribute("fill", n.col);
            var tx = document.createElementNS(SVGNS, "text");
            tx.setAttribute("text-anchor", "middle");
            tx.setAttribute("y", (n.r + 4).toFixed(1));
            tx.setAttribute("dominant-baseline", "hanging");
            tx.textContent =
                n.label.length > 42 ? n.label.slice(0, 40) + "…" : n.label;
            var ti = document.createElementNS(SVGNS, "title");
            ti.textContent =
                n.label +
                (n.kind === "sec"
                    ? " — " + document.getElementById(n.doc).dataset.title
                    : "");
            g.appendChild(ti);
            g.appendChild(c);
            g.appendChild(tx);
            n.el = g;
            gn.appendChild(g);
        });
        positionGraph();
    }
    function positionGraph() {
        G.nodes.forEach(function (n) {
            n.el.setAttribute(
                "transform",
                "translate(" + n.x.toFixed(1) + "," + n.y.toFixed(1) + ")",
            );
        });
        G.edges.forEach(function (e) {
            var A = G.nodes[e.a],
                B = G.nodes[e.b];
            e.el.setAttribute("x1", A.x.toFixed(1));
            e.el.setAttribute("y1", A.y.toFixed(1));
            e.el.setAttribute("x2", B.x.toFixed(1));
            e.el.setAttribute("y2", B.y.toFixed(1));
        });
    }
    function applyView() {
        $("#gview").setAttribute(
            "transform",
            "translate(" + G.x + "," + G.y + ") scale(" + G.k + ")",
        );
        $("#gnodes").style.setProperty("--gfs", (11 / G.k).toFixed(2) + "px");
        $("#gnodes").style.setProperty("--gsw", (2 / G.k).toFixed(2));
        $("#gsvg").classList.toggle("zoomed", G.k > 1.7);
    }
    function fitGraph() {
        var svg = $("#gsvg"),
            W = svg.clientWidth || 1000,
            H = svg.clientHeight || 600;
        if (!G.nodes.length) return;
        var x0 = Infinity,
            y0 = Infinity,
            x1 = -Infinity,
            y1 = -Infinity;
        G.nodes.forEach(function (n) {
            x0 = Math.min(x0, n.x - 30);
            y0 = Math.min(y0, n.y - 20);
            x1 = Math.max(x1, n.x + 30);
            y1 = Math.max(y1, n.y + 30);
        });
        G.k = Math.min(W / (x1 - x0), H / (y1 - y0)) * 0.95;
        G.x = (W - (x1 + x0) * G.k) / 2;
        G.y = (H - (y1 + y0) * G.k) / 2;
        applyView();
    }
    function openGraph() {
        $("#graph").classList.add("show");
        requestAnimationFrame(function () {
            var fresh = !G.nodes.length;
            buildGraph();
            if (fresh || G.needFit) {
                fitGraph();
                G.needFit = false;
            }
        });
    }
    function hotNode(i) {
        var svg = $("#gsvg");
        $$("#gsvg .hot").forEach(function (x) {
            x.classList.remove("hot");
        });
        if (i == null) {
            svg.classList.remove("dim");
            return;
        }
        svg.classList.add("dim");
        G.nodes[i].el.classList.add("hot");
        G.adj[i].forEach(function (p) {
            G.nodes[p[0]].el.classList.add("hot");
            G.edges[p[1]].el.classList.add("hot");
        });
    }
    (function graphInput() {
        var svg = $("#gsvg"),
            drag = null;
        function pt(e) {
            var r = svg.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        }
        svg.addEventListener(
            "wheel",
            function (e) {
                e.preventDefault();
                var p = pt(e),
                    f = Math.exp(-e.deltaY * 0.0015),
                    k2 = Math.min(8, Math.max(0.2, G.k * f));
                G.x = p.x - ((p.x - G.x) * k2) / G.k;
                G.y = p.y - ((p.y - G.y) * k2) / G.k;
                G.k = k2;
                applyView();
            },
            { passive: false },
        );
        svg.addEventListener("pointerdown", function (e) {
            var g = e.target.closest(".gn"),
                p = pt(e);
            drag = g
                ? { node: +g.dataset.i, sx: p.x, sy: p.y, moved: 0 }
                : { pan: true, sx: p.x, sy: p.y, ox: G.x, oy: G.y, moved: 0 };
            svg.setPointerCapture(e.pointerId);
            if (!g) svg.classList.add("panning");
        });
        svg.addEventListener("pointermove", function (e) {
            var p = pt(e);
            if (!drag) {
                var g = e.target.closest(".gn");
                hotNode(g ? +g.dataset.i : null);
                return;
            }
            drag.moved = Math.max(
                drag.moved,
                Math.abs(p.x - drag.sx) + Math.abs(p.y - drag.sy),
            );
            if (drag.pan) {
                G.x = drag.ox + p.x - drag.sx;
                G.y = drag.oy + p.y - drag.sy;
                applyView();
            } else {
                var n = G.nodes[drag.node];
                n.x = (p.x - G.x) / G.k;
                n.y = (p.y - G.y) / G.k;
                positionGraph();
            }
        });
        svg.addEventListener("pointerup", function () {
            var d = drag;
            drag = null;
            svg.classList.remove("panning");
            if (d && d.node != null && d.moved < 4) {
                var n = G.nodes[d.node];
                $("#graph").classList.remove("show");
                hotNode(null);
                jumpTo(n.id);
            }
        });
        svg.addEventListener("pointerleave", function () {
            if (!drag) hotNode(null);
        });
        $$("#gmode .segbtn").forEach(function (b) {
            b.addEventListener("click", function () {
                $$("#gmode .segbtn").forEach(function (x) {
                    x.classList.toggle("on", x === b);
                });
                buildGraph();
                fitGraph();
            });
        });
        $("#g-orig").addEventListener("change", function () {
            buildGraph();
            fitGraph();
        });
        $("#gq").addEventListener("input", function () {
            var q = this.value.trim().toLowerCase(),
                n = 0;
            G.nodes.forEach(function (nd) {
                var m = !!q && nd.label.toLowerCase().indexOf(q) >= 0;
                nd.el.classList.toggle("match", m);
                if (m) n++;
            });
            $("#gstat").textContent = q
                ? n + " matching nodes · Enter to centre"
                : G.nodes.length + " nodes";
        });
        $("#gq").addEventListener("keydown", function (e) {
            if (e.key !== "Enter") return;
            var m = G.nodes.filter(function (nd) {
                return nd.el.classList.contains("match");
            })[0];
            if (!m) return;
            var W = svg.clientWidth,
                H = svg.clientHeight;
            G.k = Math.max(G.k, 2);
            G.x = W / 2 - m.x * G.k;
            G.y = H / 2 - m.y * G.k;
            applyView();
            hotNode(G.nodes.indexOf(m));
        });
    })();

    // ---------- Wire-up (v6) ----------
    extHooks.pending = function () {
        return (
            (JSON.stringify(HL) !== JSON.stringify(editData.highlights || [])
                ? 1
                : 0) +
            (JSON.stringify(CT) !==
            JSON.stringify(editData.terms || { added: [], edits: {} })
                ? 1
                : 0)
        );
    };
    extHooks.list = function () {
        var out = [];
        if (JSON.stringify(HL) !== JSON.stringify(editData.highlights || []))
            out.push(
                "Highlights: " + HL.length + " (not yet in the page file)",
            );
        if (
            JSON.stringify(CT) !==
            JSON.stringify(editData.terms || { added: [], edits: {} })
        )
            out.push(
                "Tooltips: " +
                    CT.added.length +
                    " added, " +
                    Object.keys(CT.edits).length +
                    " edited",
            );
        return out;
    };
    extHooks.data = function () {
        return { highlights: HL, terms: CT };
    };
    extHooks.onFill = function (scope) {
        annotateCustom(scope);
        applyTipEdits(scope);
        HL.forEach(function (h) {
            var c = resolveRef(h.ref);
            if ((c && scope.contains(c)) || (c && c.contains(scope))) {
                if (!$('mark.hl[data-hl="' + h.id + '"]')) placeHL(h);
            }
        });
    };
    extHooks.newCard = function (card) {
        annotateCustom(card);
        applyTipEdits(card);
        G.key = "";
        palItems = null;
        targetMap = null;
    };
    annotateCustom(docEl);
    applyTipEdits(docEl);
    HL.forEach(function (h) {
        var c = resolveRef(h.ref);
        var card = c && c.closest && c.closest("article.dcard");
        if (card && card.dataset.lazy) {
            h.lazy = true;
            return;
        }
        h.missing = !placeHL(h);
    });
    renderHL();
    setTab(store.get("tab", "pins"));
    refreshEditUI();
    document.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest("[data-act]");
        if (!a) return;
        switch (a.dataset.act) {
            case "graph":
                openGraph();
                break;
            case "g-close":
                $("#graph").classList.remove("show");
                hotNode(null);
                break;
            case "g-fit":
                fitGraph();
                break;
            case "hl-copy":
                copyText(hlMarkdown(), "Highlights copied as Markdown");
                break;
            case "hl-download":
                saveFile("deforrest-highlights.md", hlMarkdown());
                break;
            case "hl-clear":
                if (!HL.length) break;
                if (a.dataset.armed) {
                    HL.forEach(function (h) {
                        removeMarks(h.id);
                    });
                    HL = [];
                    saveHL();
                    delete a.dataset.armed;
                    a.textContent = "Clear all";
                } else {
                    a.dataset.armed = 1;
                    a.textContent = "Click again to clear";
                    setTimeout(function () {
                        delete a.dataset.armed;
                        a.textContent = "Clear all";
                    }, 3000);
                }
                break;
            case "term-add":
                openTermForm(null, "");
                break;
            case "term-cancel":
                closeTermForm();
                break;
            case "term-delete":
                if (termEditing && termEditing.ref) {
                    CT.added = CT.added.filter(function (x) {
                        return x !== termEditing.ref;
                    });
                    closeTermForm();
                    saveCT();
                    reapplyTerms();
                    toast("Tooltip deleted");
                }
                break;
            case "term-reset":
                if (termEditing && termEditing.orig) {
                    delete CT.edits[termEditing.orig];
                    closeTermForm();
                    saveCT();
                    reapplyTerms();
                    toast("Original tooltip restored");
                }
                break;
        }
    });
    document.addEventListener("keydown", function (e) {
        var tag = (e.target.tagName || "").toLowerCase(),
            typing =
                tag === "input" ||
                tag === "textarea" ||
                tag === "select" ||
                e.target.isContentEditable;
        if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === "v" || e.key === "V") {
            if ($("#graph").classList.contains("show"))
                $("#graph").classList.remove("show");
            else openGraph();
        } else if (e.key === "h" || e.key === "H") {
            var s = window.getSelection();
            if (s && !s.isCollapsed) {
                e.preventDefault();
                createHL("y");
            }
        }
    });

    // ---------- Print (US Letter or A4) ----------
    var PAPER = {
        letter: {
            css: "letter",
            w: "215.9mm",
            h: "279.4mm",
            name: "US Letter",
        },
        a4: { css: "A4", w: "210mm", h: "297mm", name: "A4" },
    };
    // The @page size can't be switched by a class, so it lives in its own small style element.
    var pageSize = document.getElementById("page-size");
    if (!pageSize) {
        pageSize = document.createElement("style");
        pageSize.id = "page-size";
        pageSize.media = "print";
        document.head.appendChild(pageSize);
    }
    var paper = store.get("paper", "letter");
    if (!PAPER[paper]) paper = "letter";
    function applyPaper(pp) {
        paper = PAPER[pp] ? pp : "letter";
        store.set("paper", paper);
        pageSize.textContent = "@page { size: " + PAPER[paper].css + "; }";
        document.documentElement.style.setProperty("--page-w", PAPER[paper].w);
        document.documentElement.style.setProperty("--page-h", PAPER[paper].h);
        $$("input[name=ppaper]").forEach(function (r) {
            r.checked = r.value === paper;
        });
    }
    applyPaper(paper);
    $$("input[name=ppaper]").forEach(function (r) {
        r.addEventListener("change", function () {
            if (r.checked) applyPaper(r.value);
        });
    });
    var printState = null;
    function partInfo(card) {
        var lp = card.closest(".lib-part, #part-added");
        if (!lp) return { key: "x", kicker: "", title: "" };
        var k = $(".part-kicker", lp),
            ti = $(".part-title", lp);
        return {
            key: lp.id,
            kicker: k ? k.textContent : "Added",
            title: ti ? ti.textContent : "Added documents",
        };
    }
    function cardKicker(c) {
        var k = $(".d-kicker", c);
        return k ? k.textContent : "";
    }
    function openPrint(card) {
        var cur =
            card ||
            cards().filter(function (c) {
                return c.offsetParent;
            })[currentCardIndex()];
        printState = { card: cur };
        $("#pdocname").textContent = cur
            ? cur.dataset.title.replace(/^claude\//, "")
            : "(none)";
        $$("input[name=pscope]").forEach(function (r) {
            r.checked = r.value === (cur ? "doc" : "all");
        });
        $("#printdlg input[value=doc]").disabled = !cur;
        var pp = $("#ppick");
        pp.innerHTML = "";
        var lastPart = "";
        cards().forEach(function (c) {
            var pi = partInfo(c);
            if (pi.key !== lastPart) {
                lastPart = pi.key;
                var d = document.createElement("div");
                d.className = "pp-part";
                d.textContent = (pi.kicker + " " + pi.title).trim();
                pp.appendChild(d);
            }
            var l = document.createElement("label");
            l.innerHTML = '<input type="checkbox"><span></span>';
            l.querySelector("input").value = c.id;
            l.querySelector("input").checked = c === cur;
            l.querySelector("span").textContent = c.dataset.title.replace(
                /^claude\//,
                "",
            );
            pp.appendChild(l);
        });
        syncPrintDlg();
        $("#printdlg").classList.add("show");
    }
    function syncPrintDlg() {
        var sc = ($("input[name=pscope]:checked") || {}).value;
        $("#ppick").hidden = sc !== "pick";
        $("#p-orig").closest("label").style.display =
            sc === "all" ? "" : "none";
        $("#p-cover").checked = $("#p-cover").dataset.touched
            ? $("#p-cover").checked
            : sc !== "doc";
    }
    $$("input[name=pscope]").forEach(function (r) {
        r.addEventListener("change", syncPrintDlg);
    });
    $("#p-cover").addEventListener("change", function () {
        this.dataset.touched = 1;
    });
    function printOpts() {
        var sc = ($("input[name=pscope]:checked") || {}).value || "all",
            targets;
        if (sc === "doc")
            targets = printState && printState.card ? [printState.card] : [];
        else if (sc === "pick")
            targets = $$("#ppick input:checked")
                .map(function (i) {
                    return document.getElementById(i.value);
                })
                .filter(Boolean);
        else
            targets = cards().filter(function (c) {
                return !c.classList.contains("orig") || $("#p-orig").checked;
            });
        return {
            scope: sc,
            targets: targets,
            cover: $("#p-cover").checked,
            gloss: $("#p-gloss").checked,
            hl: $("#p-hl").checked,
            hlapp: $("#p-hlapp").checked,
        };
    }
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    // print: leave out external URLs and video reference lists
    var URLRE =
        /(\b[Ss]ource:\s*)?(?:https?:\/\/|www\.)[^\s<>"')\]]+[^\s<>"')\].,;:!?]/g;
    function stripExternal(scope) {
        if (scope.dataset.stripped) return;
        scope.dataset.stripped = "1";
        $$('.part[data-pid="videos"]', scope).forEach(function (p) {
            p.classList.add("print-omit");
        });
        $$("h1,h2,h3,h4,h5,h6", scope).forEach(function (h) {
            if (
                !/\bvideo/i.test(h.textContent) ||
                !/(references?|links?|videos)\b/i.test(h.textContent)
            )
                return;
            if (h.closest('.part[data-pid="videos"]')) return;
            var lv = +h.tagName[1];
            h.classList.add("print-omit");
            var n = h.nextElementSibling;
            while (n && !(/^H[1-6]$/.test(n.tagName) && +n.tagName[1] <= lv)) {
                n.classList.add("print-omit");
                n = n.nextElementSibling;
            }
        });
        var touched = new Set();
        $$('a[href^="http"], a[href^="www"]', scope).forEach(function (a) {
            if (!/^\s*(https?:\/\/|www\.)/.test(a.textContent)) return;
            var w = document.createElement("span");
            w.className = "print-omit ext-url";
            a.parentNode.insertBefore(w, a);
            w.appendChild(a);
            touched.add(w.parentElement);
            var prev = w.previousSibling;
            if (
                prev &&
                prev.nodeType === 3 &&
                /[Ss]ource:\s*$/.test(prev.nodeValue)
            ) {
                var m = prev.nodeValue.match(/\s*[Ss]ource:\s*$/);
                var t2 = prev.splitText(m.index);
                var s2 = document.createElement("span");
                s2.className = "print-omit";
                t2.parentNode.insertBefore(s2, t2);
                s2.appendChild(t2);
            }
            var next = w.nextSibling;
            if (
                next &&
                next.nodeType === 3 &&
                /^\./.test(next.nodeValue) &&
                prev &&
                /[Ss]ource:\s*$/.test(prev.nodeValue || "")
            ) {
                next.nodeValue = next.nodeValue.slice(1);
            }
        });
        var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                var p = n.parentElement;
                if (
                    !p ||
                    p.closest("pre,code,script,style,template,.print-omit,a")
                )
                    return NodeFilter.FILTER_REJECT;
                URLRE.lastIndex = 0;
                return URLRE.test(n.nodeValue)
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            },
        });
        var nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(function (n) {
            var s = n.nodeValue,
                frag = document.createDocumentFragment(),
                last = 0,
                m;
            URLRE.lastIndex = 0;
            while ((m = URLRE.exec(s))) {
                var end = m.index + m[0].length;
                if (m[1] && s.charAt(end) === ".") end++;
                if (m.index > last)
                    frag.appendChild(
                        document.createTextNode(s.slice(last, m.index)),
                    );
                var sp = document.createElement("span");
                sp.className = "print-omit ext-url";
                sp.textContent = s.slice(m.index, end);
                frag.appendChild(sp);
                last = end;
            }
            if (last < s.length)
                frag.appendChild(document.createTextNode(s.slice(last)));
            touched.add(n.parentElement);
            n.parentNode.replaceChild(frag, n);
        });
        var cw = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                var p = n.parentElement;
                return p &&
                    p.closest("pre, code") &&
                    !p.closest(".print-omit") &&
                    /https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+\/\S+/i.test(
                        n.nodeValue,
                    )
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            },
        });
        var cn = [];
        while (cw.nextNode()) cn.push(cw.currentNode);
        cn.forEach(function (n) {
            var re = /https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+\/\S+/gi,
                s = n.nodeValue,
                frag = document.createDocumentFragment(),
                last = 0,
                m;
            while ((m = re.exec(s))) {
                if (m.index > last)
                    frag.appendChild(
                        document.createTextNode(s.slice(last, m.index)),
                    );
                var sp = document.createElement("span");
                sp.className = "print-omit ext-url";
                sp.textContent = m[0];
                frag.appendChild(sp);
                last = m.index + m[0].length;
            }
            if (last < s.length)
                frag.appendChild(document.createTextNode(s.slice(last)));
            n.parentNode.replaceChild(frag, n);
        });
        touched.forEach(function (el) {
            var blk = el.closest("li, p, td");
            if (!blk) return;
            var c = blk.cloneNode(true);
            $$(".print-omit", c).forEach(function (x) {
                x.remove();
            });
            var rest = c.textContent.replace(/[\s"“”'’:;,.()\-–—|]+/g, "");
            if (
                !rest ||
                (/:\s*$/.test(c.textContent.trim()) && blk.tagName === "LI")
            )
                blk.classList.add("print-omit");
        });
    }
    function dividerLists(o) {
        $$(".pdiv-list").forEach(function (x) {
            x.remove();
        });
        $$(".srcchips.in-head").forEach(function (sc) {
            sc.classList.remove("in-head");
            if (sc.__home) {
                var nx = sc.__home[1];
                if (nx && nx.parentNode === sc.__home[0])
                    sc.__home[0].insertBefore(sc, nx);
                else sc.__home[0].appendChild(sc);
            }
        });
        if (o.scope !== "all") return;
        $$(".lib-part").forEach(function (lp) {
            var cs = $$("article.dcard.ptarget", lp);
            if (!cs.length) return;
            var box = el(
                "div",
                "pdiv-list" + (lp.id === "part-v" ? " origs" : ""),
            );
            cs.forEach(function (c) {
                var d = el("div", "pd-doc");
                d.appendChild(
                    el("b", null, c.dataset.title.replace(/^claude\//, "")),
                );
                if (lp.id !== "part-v") {
                    d.appendChild(
                        el(
                            "small",
                            null,
                            cardKicker(c).split(" · ").slice(0, 2).join(" · "),
                        ),
                    );
                    $$(
                        ".d-rendered section.chapter > h1, .d-rendered .part > h2",
                        c,
                    ).forEach(function (h) {
                        if (h.closest(".print-omit")) return;
                        d.appendChild(
                            el(
                                "span",
                                "pd-sec " + (h.tagName === "H1" ? "l1" : "l2"),
                                headText(h),
                            ),
                        );
                    });
                }
                box.appendChild(d);
            });
            var anchor = $(".part-intro", lp) || $(".part-head", lp);
            anchor.parentNode.insertBefore(box, anchor.nextSibling);
        });
    }
    function preparePrint(o) {
        cleanupPrint();
        if (!o.targets.length) {
            toast("Choose at least one document to print");
            return false;
        }
        if (editingPart) finishEdit(true);
        o.targets.forEach(function (c) {
            if (c.dataset.lazy) fillLazy(c);
            c.classList.add("ptarget");
            stripExternal(c);
        });
        dividerLists(o);
        o.targets.forEach(function (c) {
            var head = $(".d-head", c);
            $$(".d-rendered .srcchips", c).forEach(function (sc) {
                sc.__home = [sc.parentNode, sc.nextSibling];
                sc.classList.add("in-head");
                head.appendChild(sc);
            });
        });
        document.body.classList.add("printing");
        document.body.classList.toggle("print-single", o.scope !== "all");
        document.body.classList.toggle("print-hl", !!o.hl);
        var front = $("#print-front"),
            back = $("#print-back");
        front.innerHTML = "";
        back.innerHTML = "";
        var single = o.targets.length === 1,
            words = 0;
        o.targets.forEach(function (c) {
            var m = cardKicker(c).match(/([\d,]+) words/);
            words += m ? +m[1].replace(/,/g, "") : 0;
        });
        if (o.cover) {
            var cv = el("section", "pf-cover");
            cv.appendChild(
                el("div", "pf-eyebrow", "DeForrest · project record"),
            );
            cv.appendChild(
                el(
                    "div",
                    "pf-title",
                    single
                        ? o.targets[0].dataset.title.replace(/^claude\//, "")
                        : "The DeForrest Compendium",
                ),
            );
            cv.appendChild(
                el(
                    "p",
                    "pf-scope",
                    o.scope === "all"
                        ? "The complete library: every compendium document" +
                              (o.targets.some(function (c) {
                                  return c.classList.contains("orig");
                              })
                                  ? ", with the original project documents"
                                  : "") +
                              "."
                        : single
                          ? "From the DeForrest Compendium · " +
                            cardKicker(o.targets[0])
                          : "A selection of " +
                            o.targets.length +
                            " documents from the DeForrest Compendium.",
                ),
            );
            var lede = $(".masthead .lede");
            if (lede && !single)
                cv.appendChild(el("p", "pf-lede", lede.textContent));
            var facts = el("div", "pf-facts");
            [
                [
                    o.targets.length,
                    o.targets.length === 1 ? "document" : "documents",
                ],
                [words ? words.toLocaleString() : "—", "words"],
                [
                    $$("figure.dg", $("#doc")).filter(function (f) {
                        return o.targets.some(function (c) {
                            return c.contains(f);
                        });
                    }).length,
                    "diagrams",
                ],
            ].forEach(function (f) {
                var d = el("div");
                d.appendChild(el("b", null, String(f[0])));
                d.appendChild(document.createTextNode(f[1]));
                facts.appendChild(d);
            });
            cv.appendChild(facts);
            var ft = el("div", "pf-foot");
            ft.appendChild(el("span", null, "DeForrest project record"));
            cv.appendChild(ft);
            front.appendChild(cv);
            if (!single) {
                var toc = el("section", "pf-toc");
                toc.appendChild(el("h2", null, "Contents"));
                toc.appendChild(
                    el(
                        "p",
                        "pf-sub",
                        "Each Part opens with a page listing its documents and sections. Section numbers (§) match the references in the text.",
                    ),
                );
                var cur = null;
                o.targets.forEach(function (c) {
                    var pi = partInfo(c);
                    if (!cur || cur.key !== pi.key) {
                        cur = { key: pi.key, box: el("div", "pf-part") };
                        cur.box.appendChild(el("div", null, pi.kicker));
                        cur.box.appendChild(el("b", null, pi.title));
                        toc.appendChild(cur.box);
                    }
                    var row = el("div", "pf-row");
                    row.appendChild(
                        el(
                            "span",
                            null,
                            c.dataset.title.replace(/^claude\//, ""),
                        ),
                    );
                    row.appendChild(el("i"));
                    row.appendChild(
                        el(
                            "span",
                            null,
                            cardKicker(c).split(" · ").slice(0, 2).join(" · "),
                        ),
                    );
                    cur.box.appendChild(row);
                });
                if (o.gloss || (o.hlapp && HL.length)) {
                    var bx = el("div", "pf-part");
                    bx.appendChild(el("div", null, "Appendix"));
                    if (o.gloss) {
                        var r1 = el("div", "pf-row");
                        r1.appendChild(el("span", null, "Glossary"));
                        r1.appendChild(el("i"));
                        r1.appendChild(el("span", null, "defined terms"));
                        bx.appendChild(r1);
                    }
                    if (o.hlapp && HL.length) {
                        var r2 = el("div", "pf-row");
                        r2.appendChild(
                            el("span", null, "Highlights and notes"),
                        );
                        r2.appendChild(el("i"));
                        r2.appendChild(
                            el("span", null, HL.length + " passages"),
                        );
                        bx.appendChild(r2);
                    }
                    toc.appendChild(bx);
                }
                front.appendChild(toc);
            }
            front.classList.add("on");
        }
        if (o.gloss) {
            var gs = el("section", "pb-sec");
            gs.appendChild(el("h2", null, "Glossary"));
            gs.appendChild(
                el(
                    "p",
                    "pf-sub",
                    "The definitions shown as tooltips throughout the compendium.",
                ),
            );
            var dl = el("dl", "pb-gloss"),
                letter = "";
            GLOSS.map(function (g) {
                return [g[0], CT.edits[g[2]] != null ? CT.edits[g[2]] : g[2]];
            })
                .concat(
                    CT.added.map(function (c) {
                        return [c.label, c.tip];
                    }),
                )
                .sort(function (a, b) {
                    return a[0]
                        .toLowerCase()
                        .replace(/^[^a-z0-9]+/, "")
                        .localeCompare(
                            b[0].toLowerCase().replace(/^[^a-z0-9]+/, ""),
                        );
                })
                .forEach(function (g) {
                    var L = (
                        g[0].replace(/^[^A-Za-z0-9]+/, "").charAt(0) || "#"
                    ).toUpperCase();
                    if (L !== letter) {
                        letter = L;
                        dl.appendChild(el("span", "pl", L));
                    }
                    var d = el("div");
                    d.appendChild(el("dt", null, g[0]));
                    d.appendChild(
                        el(
                            "dd",
                            null,
                            g[1].replace(
                                new RegExp(
                                    "^" + escRe2(g[0]) + "\\s*:\\s*",
                                    "i",
                                ),
                                "",
                            ),
                        ),
                    );
                    dl.appendChild(d);
                });
            gs.appendChild(dl);
            back.appendChild(gs);
        }
        if (o.hlapp && HL.length) {
            var hs = el("section", "pb-sec");
            hs.appendChild(el("h2", null, "Highlights and notes"));
            hs.appendChild(
                el(
                    "p",
                    "pf-sub",
                    HL.length + " passages marked while reading.",
                ),
            );
            var ul = el("ul", "pb-hl");
            HL.forEach(function (h) {
                var li = el("li", h.c);
                li.appendChild(el("q", null, h.text));
                li.appendChild(el("small", null, h.label));
                if (h.note) li.appendChild(el("em", null, h.note));
                ul.appendChild(li);
            });
            hs.appendChild(ul);
            back.appendChild(hs);
        }
        if (back.childNodes.length) back.classList.add("on");
        return true;
    }
    function cleanupPrint() {
        $$(".ptarget").forEach(function (c) {
            c.classList.remove("ptarget");
        });
        $$(".pdiv-list").forEach(function (x) {
            x.remove();
        });
        document.body.classList.remove("printing", "print-single", "print-hl");
        var f = $("#print-front"),
            b = $("#print-back");
        f.innerHTML = "";
        b.innerHTML = "";
        f.classList.remove("on");
        b.classList.remove("on");
    }
    var printAuto = false,
        printing = false;
    window.addEventListener("beforeprint", function () {
        if (document.body.classList.contains("printing")) return;
        printAuto = true;
        preparePrint({
            scope: "all",
            targets: cards().filter(function (c) {
                return !c.classList.contains("orig");
            }),
            cover: true,
            gloss: false,
            hl: true,
            hlapp: false,
        });
    });
    window.addEventListener("afterprint", function () {
        printing = false;
        cleanupPrint();
        printAuto = false;
    });
    function doPrint() {
        var o = printOpts();
        $("#printdlg").classList.remove("show");
        if (!preparePrint(o)) return;
        printing = true;
        setTimeout(function () {
            try {
                window.print();
            } catch (e) {
                toast(
                    "Printing is blocked here; use “Download print-ready file”",
                );
                cleanupPrint();
            }
            setTimeout(function () {
                if (printing) {
                    printing = false;
                    cleanupPrint();
                }
            }, 1500);
        }, 80);
    }
    // Gather the page's CSS for the standalone print-ready file. The print block is unwrapped so the file previews as paper on screen.
    // Browsers block reading stylesheet rules on file:// pages; then the file links styles.css instead (keep it next to the file).
    function collectStyles() {
        var out = [];
        try {
            Array.prototype.forEach.call(document.styleSheets, function (sh) {
                Array.prototype.forEach.call(sh.cssRules, function (r) {
                    if (
                        r.type === CSSRule.MEDIA_RULE &&
                        r.media.mediaText === "print"
                    )
                        Array.prototype.forEach.call(r.cssRules, function (x) {
                            out.push(x.cssText);
                        });
                    else out.push(r.cssText);
                });
            });
            return "<style>\n" + out.join("\n") + "\n</style>";
        } catch (e) {
            return (
                '<link rel="stylesheet" href="styles.css">\n<style>' +
                pageSize.textContent +
                "</style>"
            );
        }
    }
    function printFile() {
        var o = printOpts();
        $("#printdlg").classList.remove("show");
        if (!preparePrint(o)) return;
        var docClone = $("#doc").cloneNode(true);
        $$("article.dcard:not(.ptarget)", docClone).forEach(function (c) {
            c.remove();
        });
        $$(".lib-part, #part-added", docClone).forEach(function (p) {
            if (!p.querySelector("article.dcard")) p.remove();
        });
        $$(
            "template, .d-raw, .d-bar, .d-foot, .edit-btn, .copybtn, .hpin, .hlink, .fold, .d-fold, .dmenu-wrap, script",
            docClone,
        ).forEach(function (x) {
            x.remove();
        });
        clearMarks(docClone);
        var styles = collectStyles();
        var title =
            o.targets.length === 1
                ? o.targets[0].dataset.title.replace(/^claude\//, "")
                : "DeForrest Compendium";
        var html =
            '<!DOCTYPE html>\n<html lang="en" style="--page-w:' +
            PAPER[paper].w +
            ";--page-h:" +
            PAPER[paper].h +
            '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' +
            escHTML(title) +
            " (" +
            PAPER[paper].name +
            ")</title>\n" +
            styles +
            '\n</head>\n<body class="' +
            document.body.className.replace(
                /\b(pins-open|focus|editing|searching)\b/g,
                "",
            ) +
            ' printfile">' +
            '<div class="printbar"><span>Print-ready ' +
            PAPER[paper].name +
            ' layout.</span><button type="button" onclick="window.print()">Print or save as PDF</button></div><div class="wrap">' +
            $("#print-front").outerHTML +
            docClone.outerHTML +
            $("#print-back").outerHTML +
            "</div></body></html>";
        cleanupPrint();
        saveFile(slugify(title) + "-" + paper + ".html", html);
    }
    document.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest("[data-act]");
        if (!a) return;
        switch (a.dataset.act) {
            case "print-open":
                openPrint(null);
                break;
            case "print-doc":
                openPrint(a.closest("article.dcard"));
                break;
            case "print-go":
                doPrint();
                break;
            case "print-file":
                printFile();
                break;
            case "print-close":
                $("#printdlg").classList.remove("show");
                break;
        }
    });
    function addPrintBtn(card) {
        var bar = $(".d-bar", card);
        if (!bar || $('[data-act="print-doc"]', bar)) return;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "tbtn";
        b.dataset.act = "print-doc";
        b.textContent = "Print";
        var pin = $('[data-act="pin-doc"]', bar);
        bar.insertBefore(b, pin || null);
    }
    cards().forEach(addPrintBtn);
    var _nc = extHooks.newCard;
    extHooks.newCard = function (card) {
        if (_nc) _nc(card);
        addPrintBtn(card);
    };

    // ---------- Floating Toolboxes ----------
    var TBS = store.get("Toolboxes", {});
    var stack = $("#Toolbox-Stack");
    function tbSave() {
        store.set("Toolboxes", TBS);
    }
    function tbState(box) {
        return TBS[box.id] || (TBS[box.id] = {});
    }
    function tbClamp(box) {
        if (!box.classList.contains("free")) return;
        var r = box.getBoundingClientRect(),
            W = window.innerWidth,
            H = window.innerHeight;
        var x = Math.min(Math.max(4, r.left), W - Math.min(r.width, W) - 4),
            y = Math.min(Math.max(6, r.top), H - 40);
        box.style.left = x + "px";
        box.style.top = y + "px";
        var st = tbState(box);
        st.x = x;
        st.y = y;
    }
    function tbApply(box) {
        var st = tbState(box);
        box.hidden = !!st.hidden;
        box.classList.toggle("collapsed", !!st.collapsed);
        var cb = $('[data-act="Toolbox-Collapse"]', box);
        if (cb) cb.setAttribute("aria-expanded", String(!st.collapsed));
        if (st.free) {
            box.classList.add("free");
            box.style.left = st.x + "px";
            box.style.top = st.y + "px";
            tbClamp(box);
        } else {
            box.classList.remove("free");
            box.style.left = box.style.top = "";
        }
    }
    function tbRefresh() {
        var boxes = $$(".Toolbox");
        boxes.forEach(tbApply);
        document.body.classList.toggle(
            "tb-docked",
            boxes.some(function (b) {
                return !b.hidden && !b.classList.contains("free");
            }),
        );
        $$('[data-act="tb-toggle"]').forEach(function (b) {
            var bx = document.getElementById(b.dataset.tb);
            var on = bx && !bx.hidden;
            b.classList.toggle("on", on);
            b.classList.toggle("off", !on);
            b.setAttribute("aria-pressed", String(on));
        });
    }
    function tbShow(id, show) {
        var box = document.getElementById(id),
            st = tbState(box);
        st.hidden = !show;
        if (show) st.collapsed = false;
        tbSave();
        tbRefresh();
    }
    if (!Object.keys(TBS).length) {
        TBS = {
            "tb-search": {},
            "tb-tools": { collapsed: true },
            "tb-contents": {},
        };
    }
    tbRefresh();
    (function tbDrag() {
        var drag = null;
        document.addEventListener("pointerdown", function (e) {
            var head = e.target.closest && e.target.closest(".Toolbox-Head");
            if (!head || e.target.closest("button")) return;
            if (window.matchMedia("(max-width: 900px)").matches) return;
            var box = head.parentNode,
                r = box.getBoundingClientRect();
            drag = {
                box: box,
                dx: e.clientX - r.left,
                dy: e.clientY - r.top,
                sx: e.clientX,
                sy: e.clientY,
                moved: false,
            };
            head.setPointerCapture(e.pointerId);
        });
        document.addEventListener("pointermove", function (e) {
            if (!drag) return;
            if (
                !drag.moved &&
                Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) <
                    4
            )
                return;
            var box = drag.box,
                st = tbState(box);
            if (!drag.moved) {
                drag.moved = true;
                box.classList.add("free", "dragging");
                st.free = true;
                document.body.appendChild(box);
            }
            st.x = e.clientX - drag.dx;
            st.y = e.clientY - drag.dy;
            box.style.left = st.x + "px";
            box.style.top = st.y + "px";
        });
        document.addEventListener("pointerup", function () {
            if (!drag) return;
            var box = drag.box;
            box.classList.remove("dragging");
            if (drag.moved) {
                tbClamp(box);
                tbSave();
                tbRefresh();
            }
            drag = null;
        });
        window.addEventListener("resize", function () {
            $$(".Toolbox.free").forEach(tbClamp);
        });
    })();
    document.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest("[data-act]");
        if (!a) return;
        var box = a.closest(".Toolbox");
        switch (a.dataset.act) {
            case "Toolbox-Collapse": {
                var st = tbState(box);
                st.collapsed = !st.collapsed;
                tbSave();
                tbRefresh();
                break;
            }
            case "Toolbox-Hide":
                tbShow(box.id, false);
                break;
            case "tb-toggle": {
                var bx = document.getElementById(a.dataset.tb);
                tbShow(
                    a.dataset.tb,
                    bx.hidden || bx.classList.contains("collapsed"),
                );
                break;
            }
            case "tb-reset":
                TBS = { "tb-search": {}, "tb-tools": {}, "tb-contents": {} };
                ["tb-search", "tb-tools", "tb-contents"].forEach(function (id) {
                    stack.appendChild(document.getElementById(id));
                });
                tbSave();
                tbRefresh();
                toast("Toolboxes docked");
                break;
        }
    });
    // keep the active contents entry in view inside its Toolbox
    var tocBody = $("#tb-contents .Toolbox-Body");
    window.addEventListener(
        "scroll",
        function () {
            var act = $(".toc a.active:last-of-type") || $(".toc a.active");
            if (!act || !tocBody || tocBody.offsetParent === null) return;
            var r = act.getBoundingClientRect(),
                br = tocBody.getBoundingClientRect();
            if (r.top < br.top + 8 || r.bottom > br.bottom - 8)
                tocBody.scrollTop += r.top - br.top - br.height / 3;
        },
        { passive: true },
    );
    function ensureSearchBox() {
        var st = tbState($("#tb-search"));
        if (st.hidden || st.collapsed) {
            st.hidden = false;
            st.collapsed = false;
            tbSave();
            tbRefresh();
        }
    }

    // ---------- Start ----------
    var initialHash = (location.hash || "").slice(1);
    if (initialHash)
        setTimeout(function () {
            jumpTo(initialHash, false);
        }, 60);
    window.addEventListener("hashchange", function () {
        var h = location.hash.slice(1);
        if (h) jumpTo(h, false);
    });
})();
