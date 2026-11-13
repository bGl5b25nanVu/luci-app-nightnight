(function () {
	const API_URL = "/cgi-bin/nightnight-api";
	let currentView = "topology";
	let currentGroupFilter = "all";
	let showAllGroups = false;
	let latestOverview = null;
	let selectedDeviceIp = null;

	function fmtBytes(b) {
		b = Number(b || 0);
		if (b <= 0) return "0 B";
		if (b < 1024) return Math.round(b) + " B";
		if (b < 1024 * 1024) {
			const kb = b / 1024;
			return (kb >= 100 ? Math.round(kb) : kb.toFixed(1).replace(/\.0$/, "")) + " KB";
		}
		if (b < 1024 * 1024 * 1024) {
			const mb = b / (1024 * 1024);
			return (mb >= 100 ? Math.round(mb) : mb.toFixed(1).replace(/\.0$/, "")) + " MB";
		}
		return (b / (1024 * 1024 * 1024)).toFixed(2).replace(/\.00$/, "") + " GB";
	}

	function fmtRate(bps) {
		return fmtBytes(bps) + "/s";
	}

	function esc(s) {
		return String(s == null ? "" : s)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	function deviceIconSvg(type) {
		if (type === "laptop") {
			return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="12" rx="2"></rect><line x1="2" y1="20" x2="22" y2="20"></line></svg>';
		}
		return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>';
	}

	function switchView(view, opts) {
		currentView = view;
		document.querySelectorAll(".nn-tab").forEach(btn => {
			btn.classList.toggle("active", btn.getAttribute("data-view") === view);
		});
		document.getElementById("view-topology").style.display = view === "topology" ? "" : "none";
		document.getElementById("view-hosts").style.display = view === "hosts" ? "" : "none";
		document.getElementById("view-inspect").style.display = view === "inspect" ? "" : "none";

		if (view === "topology") {
			requestAnimationFrame(drawTopologyLines);
		} else if (view === "hosts") {
			if (opts && opts.group) currentGroupFilter = opts.group;
			loadHostsView();
		} else if (view === "inspect") {
			if (opts && opts.host) {
				document.getElementById("nn-inspect-input").value = opts.host;
			}
			loadInspectView();
		}
	}

	document.querySelectorAll(".nn-tab").forEach(btn => {
		btn.addEventListener("click", () => switchView(btn.getAttribute("data-view")));
	});

	// Drawer toggle
	const drawerToggle = document.getElementById("nn-drawer-toggle");
	const drawerBody = document.getElementById("nn-drawer-body");
	const drawerArrow = document.getElementById("nn-drawer-arrow");
	drawerToggle.addEventListener("click", () => {
		const hidden = drawerBody.style.display === "none";
		drawerBody.style.display = hidden ? "" : "none";
		drawerArrow.textContent = hidden ? "收起 ▲" : "展开 ▼";
	});

	// Render Topology View
	function renderOverview(data) {
		latestOverview = data;
		const r = data.router || {};

		// Top alert banner
		const alerts = data.alerts || [];
		const banner = document.getElementById("nn-alert-banner");
		if (alerts.length > 0) {
			const groupNames = [];
			alerts.forEach(a => {
				if (groupNames.indexOf(a.group_name) < 0) groupNames.push(a.group_name);
			});
			document.getElementById("nn-alert-text").textContent =
				"有 " + groupNames.length + " 个去向值得看一眼：" + groupNames.slice(0, 3).join("、");
			banner.style.display = "flex";
			document.getElementById("nn-alert-btn").onclick = () => {
				switchView("hosts", { group: alerts[0].group_id });
			};
		} else {
			banner.style.display = "none";
		}

		// Router center card
		document.getElementById("nn-router-up").textContent = fmtRate(r.up_bps || 0);
		document.getElementById("nn-router-down").textContent = fmtRate(r.down_bps || 0);
		document.getElementById("nn-meta-devices").textContent =
			(r.active_devices || 0) + " 台设备正在传输 · 共 " + (r.total_devices || 0) + " 台";
		document.getElementById("nn-meta-groups").textContent =
			(r.active_groups || 0) + " 个去向正在传输 · 共 " + (r.total_groups || 0) + " 个";
		document.getElementById("nn-meta-today").textContent =
			"今天累计 ↑ " + fmtBytes(r.today_up || 0) + " ↓ " + fmtBytes(r.today_down || 0);
		document.getElementById("nn-meta-status").textContent = r.status_text || "实时数据正常";

		// Populate device dropdown in Inspect view
		const devSelect = document.getElementById("nn-inspect-device");
		const curVal = devSelect.value;
		let devOpts = '<option value="all">全部设备</option>';
		(data.devices || []).forEach(d => {
			devOpts += `<option value="${esc(d.ip)}">${esc(d.name)} (${esc(d.ip)})</option>`;
		});
		devSelect.innerHTML = devOpts;
		if (curVal) devSelect.value = curVal;

		// Left column: Devices
		const devContainer = document.getElementById("nn-devices-list");
		let devHtml = "";
		(data.devices || []).forEach(d => {
			const selClass = selectedDeviceIp === d.ip ? "selected" : "";
			devHtml += `
				<div class="nn-node-card ${selClass}" data-device-ip="${esc(d.ip)}" title="IP: ${esc(d.ip)}${d.mac ? ' · MAC: ' + esc(d.mac) : ''}（双击名称可重命名）">
					<div class="nn-node-left">
						<div class="nn-icon-box">${deviceIconSvg(d.icon)}</div>
						<div class="nn-node-info">
							<div class="nn-node-name-row">
								<span class="nn-node-name" data-rename-ip="${esc(d.ip)}" data-current-name="${esc(d.name)}">${esc(d.name)}</span>
							</div>
						</div>
					</div>
					<div class="nn-node-rates">
						<div class="nn-rate-up">↑ ${fmtRate(d.up_bps || 0)}</div>
						<div class="nn-rate-down">↓ ${fmtRate(d.down_bps || 0)}</div>
					</div>
				</div>
			`;
		});
		devContainer.innerHTML = devHtml;
		devContainer.querySelectorAll(".nn-node-card").forEach(el => {
			el.addEventListener("click", () => {
				const ip = el.getAttribute("data-device-ip");
				selectedDeviceIp = (selectedDeviceIp === ip) ? null : ip;
				renderOverview(latestOverview);
			});
			el.addEventListener("dblclick", async (ev) => {
				ev.stopPropagation();
				const ip = el.getAttribute("data-device-ip");
				const nameEl = el.querySelector("[data-current-name]");
				const curName = nameEl ? nameEl.getAttribute("data-current-name") : "";
				const nextName = window.prompt(`为设备 (${ip}) 设置显示名称：`, curName);
				if (nextName && nextName.trim() && nextName.trim() !== curName) {
					await fetch(`${API_URL}?action=rename_device&ip=${encodeURIComponent(ip)}&name=${encodeURIComponent(nextName.trim())}`);
					await pollOverview();
				}
			});
		});

		// Right column: Destination Groups
		const groups = data.groups || [];
		const maxVisible = showAllGroups ? groups.length : 7;
		const visibleGroups = groups.slice(0, maxVisible);
		const hiddenCount = groups.length - visibleGroups.length;

		const grpContainer = document.getElementById("nn-groups-list");
		let grpHtml = "";
		visibleGroups.forEach(g => {
			const active = (g.up_bps || 0) > 0 || (g.down_bps || 0) > 0;
			const badgeHtml = g.warning_badge
				? `<span class="nn-badge warn">${esc(g.warning_badge)}</span>`
				: "";
			const subText = (g.device_count > 0 && active)
				? `${g.device_count} 台设备在用`
				: (g.conn_count > 0 ? `${g.conn_count} 个连接` : (g.device_count > 0 ? `${g.device_count} 台设备在用` : "历史记录"));
			const rightHtml = active
				? `<div class="nn-rate-up">↑ ${fmtRate(g.up_bps)}</div><div class="nn-rate-down">↓ ${fmtRate(g.down_bps)}</div>`
				: `<div class="nn-rate-idle">空闲</div>`;

			grpHtml += `
				<div class="nn-node-card" data-group-id="${esc(g.id)}" data-up="${g.up_bps || 0}" data-down="${g.down_bps || 0}">
					<div class="nn-node-left">
						<div class="nn-icon-box">${esc(g.badge || "?")}</div>
						<div class="nn-node-info">
							<div class="nn-node-name-row">
								<span class="nn-node-name">${esc(g.name)}</span>
								${badgeHtml}
							</div>
							<div class="nn-node-sub">${esc(subText)}</div>
						</div>
					</div>
					<div class="nn-node-rates">${rightHtml}</div>
				</div>
			`;
		});

		if (hiddenCount > 0) {
			grpHtml += `
				<div class="nn-node-card" id="nn-more-groups-card">
					<div class="nn-node-left">
						<div class="nn-icon-box">+${hiddenCount}</div>
						<div class="nn-node-info">
							<div class="nn-node-name-row">
								<span class="nn-node-name">其他 ${hiddenCount} 个去向</span>
							</div>
							<div class="nn-node-sub">显示全部</div>
						</div>
					</div>
					<div class="nn-node-rates"><div class="nn-rate-idle">空闲</div></div>
				</div>
			`;
		} else if (showAllGroups && groups.length > 7) {
			grpHtml += `
				<div class="nn-node-card" id="nn-more-groups-card">
					<div class="nn-node-left">
						<div class="nn-icon-box">−</div>
						<div class="nn-node-info">
							<div class="nn-node-name-row"><span class="nn-node-name">收起空闲去向</span></div>
						</div>
					</div>
					<div class="nn-node-rates"></div>
				</div>
			`;
		}

		grpContainer.innerHTML = grpHtml;
		grpContainer.querySelectorAll(".nn-node-card[data-group-id]").forEach(el => {
			el.addEventListener("click", () => {
				switchView("hosts", { group: el.getAttribute("data-group-id") });
			});
		});
		const moreCard = document.getElementById("nn-more-groups-card");
		if (moreCard) {
			moreCard.addEventListener("click", () => {
				showAllGroups = !showAllGroups;
				renderOverview(latestOverview);
			});
		}

		// Connections drawer
		const conns = data.connections || [];
		document.getElementById("nn-conn-summary").textContent =
			"连接明细 · " + (r.total_connections || conns.length) + " 条连接";
		let cHtml = "";
		conns.slice(0, 80).forEach(c => {
			if (selectedDeviceIp && c.device_ip !== selectedDeviceIp) return;
			cHtml += `
				<tr>
					<td>
						<a class="nn-host-link" data-inspect-host="${esc(c.host)}">${esc(c.host)}</a>
						<span style="color:#8c959f;font-size:12px;">:${c.dst_port}</span>
						${c.encrypted === false ? '<span class="nn-badge warn">未加密</span>' : ""}
					</td>
					<td>${esc(c.device_name)}</td>
					<td>${esc(c.group_name)} · ${esc(c.proto)}</td>
					<td style="color:var(--up-color);">↑ ${fmtRate(c.up_bps)}</td>
					<td style="color:var(--down-color);">↓ ${fmtRate(c.down_bps)}</td>
					<td style="color:var(--up-color);">↑ ${fmtBytes(c.total_up)}</td>
					<td style="color:var(--down-color);">↓ ${fmtBytes(c.total_down)}</td>
				</tr>
			`;
		});
		const ctbody = document.getElementById("nn-conn-tbody");
		ctbody.innerHTML = cHtml;
		ctbody.querySelectorAll("[data-inspect-host]").forEach(a => {
			a.addEventListener("click", () => {
				switchView("inspect", { host: a.getAttribute("data-inspect-host") });
			});
		});

		if (currentView === "topology") {
			requestAnimationFrame(drawTopologyLines);
		}
	}

	function calcStrokeWidth(bps) {
		if (!bps || bps <= 0) return 1.2;
		const kb = bps / 1024;
		if (kb < 1) return 2.0;
		if (kb < 10) return 3.2;
		if (kb < 50) return 4.8;
		if (kb < 200) return 6.5;
		return 8.5;
	}

	function buildCurveAndDots(idPrefix, x1, y1, x2, y2, upBps, downBps) {
		const total = (upBps || 0) + (downBps || 0);
		const sw = calcStrokeWidth(total);
		const cx1 = x1 + (x2 - x1) * 0.48;
		const cy1 = y1;
		const cx2 = x1 + (x2 - x1) * 0.52;
		const cy2 = y2;
		const d = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
		const dRev = `M ${x2} ${y2} C ${cx2} ${cy2}, ${cx1} ${cy1}, ${x1} ${y1}`;

		let svg = `<path d="${d}" fill="none" stroke="${total > 0 ? '#cbd5e1' : '#e5e7eb'}" stroke-width="${sw}" stroke-linecap="round" opacity="${total > 0 ? 0.85 : 0.6}" />`;

		if (total > 0) {
			const dur = Math.max(1.2, Math.min(3.6, 3.8 - Math.log10(total + 10) * 0.45)).toFixed(2) + "s";
			// Upload dots (left -> right)
			if (upBps > 0) {
				const numUp = upBps > 20480 ? 4 : (upBps > 2048 ? 3 : 2);
				for (let i = 0; i < numUp; i++) {
					const begin = ((i / numUp) * parseFloat(dur)).toFixed(2) + "s";
					svg += `<circle r="3.3" fill="#d96b27"><animateMotion dur="${dur}" begin="-${begin}" repeatCount="indefinite" path="${d}" /></circle>`;
				}
			}
			// Download dots (flowing along the line)
			if (downBps > 0) {
				const numDown = downBps > 20480 ? 4 : (downBps > 2048 ? 3 : 2);
				for (let i = 0; i < numDown; i++) {
					const begin = (((i + 0.5) / numDown) * parseFloat(dur)).toFixed(2) + "s";
					svg += `<circle r="3.3" fill="#2563eb"><animateMotion dur="${dur}" begin="-${begin}" repeatCount="indefinite" path="${dRev}" /></circle>`;
				}
			}
		}
		return svg;
	}

	function drawTopologyLines() {
		if (!latestOverview || currentView !== "topology") return;
		const wrap = document.getElementById("nn-topology-wrap");
		const svgEl = document.getElementById("nn-svg-layer");
		const routerCard = document.getElementById("nn-router-card");
		if (!wrap || !svgEl || !routerCard) return;

		const wrapRect = wrap.getBoundingClientRect();
		if (wrapRect.width < 700) {
			svgEl.innerHTML = "";
			return;
		}
		svgEl.setAttribute("viewBox", `0 0 ${wrapRect.width} ${wrapRect.height}`);

		const rRect = routerCard.getBoundingClientRect();
		const routerLeftX = rRect.left - wrapRect.left;
		const routerRightX = rRect.right - wrapRect.left;
		const routerCenterY = (rRect.top + rRect.height / 2) - wrapRect.top;

		let pathsHtml = "";

		// Left devices -> Router
		const devCards = wrap.querySelectorAll("#nn-devices-list .nn-node-card");
		const devsMap = {};
		(latestOverview.devices || []).forEach(d => { devsMap[d.ip] = d; });

		devCards.forEach((card, idx) => {
			const ip = card.getAttribute("data-device-ip");
			const d = devsMap[ip] || { up_bps: 0, down_bps: 0 };
			const cRect = card.getBoundingClientRect();
			const x1 = cRect.right - wrapRect.left;
			const y1 = (cRect.top + cRect.height / 2) - wrapRect.top;
			pathsHtml += buildCurveAndDots("dev-" + idx, x1, y1, routerLeftX, routerCenterY, d.up_bps, d.down_bps);
		});

		// Router -> Right groups
		const grpCards = wrap.querySelectorAll("#nn-groups-list .nn-node-card");
		const grpsMap = {};
		(latestOverview.groups || []).forEach(g => { grpsMap[g.id] = g; });

		grpCards.forEach((card, idx) => {
			const gid = card.getAttribute("data-group-id");
			const g = gid ? (grpsMap[gid] || { up_bps: 0, down_bps: 0 }) : { up_bps: 0, down_bps: 0 };
			const cRect = card.getBoundingClientRect();
			const x2 = cRect.left - wrapRect.left;
			const y2 = (cRect.top + cRect.height / 2) - wrapRect.top;
			pathsHtml += buildCurveAndDots("grp-" + idx, routerRightX, routerCenterY, x2, y2, g.up_bps, g.down_bps);
		});

		svgEl.innerHTML = pathsHtml;
	}

	window.addEventListener("resize", () => {
		if (currentView === "topology") requestAnimationFrame(drawTopologyLines);
	});

	// VIEW 2: Load Hostnames under Group (Screenshot 2)
	async function loadHostsView() {
		const res = await fetch(`${API_URL}?action=hosts&id=${encodeURIComponent(currentGroupFilter)}`);
		const data = await res.json();

		// Render group filter chips
		const chipsEl = document.getElementById("nn-group-chips");
		const groups = (latestOverview && latestOverview.groups) ? latestOverview.groups : [];
		let chipsHtml = `<span class="nn-chip ${currentGroupFilter === 'all' ? 'active' : ''}" data-gid="all">全部网站</span>`;
		groups.forEach(g => {
			const active = currentGroupFilter === g.id ? "active" : "";
			chipsHtml += `<span class="nn-chip ${active}" data-gid="${esc(g.id)}">${esc(g.name)}</span>`;
		});
		chipsEl.innerHTML = chipsHtml;
		chipsEl.querySelectorAll(".nn-chip").forEach(chip => {
			chip.addEventListener("click", () => {
				currentGroupFilter = chip.getAttribute("data-gid");
				loadHostsView();
			});
		});

		const tbody = document.getElementById("nn-hosts-tbody");
		let html = "";
		(data.hosts || []).forEach(h => {
			let tagsHtml = "";
			(h.tags || []).forEach(t => {
				tagsHtml += ` <span class="nn-badge ${esc(t.type)}">${esc(t.text)}</span>`;
			});
			html += `
				<tr>
					<td>
						<div>
							<a class="nn-host-link" data-host="${esc(h.host)}">${esc(h.host)}</a>
							${tagsHtml}
						</div>
						<div class="nn-host-sub">${esc(h.provider)} · ${esc(h.device_label)}</div>
					</td>
					<td style="color:var(--up-color);font-weight:600;">↑ ${fmtBytes(h.up)}</td>
					<td style="color:var(--down-color);font-weight:600;">↓ ${fmtBytes(h.down)}</td>
					<td>${h.conn_count}</td>
					<td>${fmtBytes(h.max_single_up)}</td>
					<td>${fmtBytes(h.night_up)}</td>
					<td>${esc(h.active_label)}</td>
				</tr>
			`;
		});
		if (!html) {
			html = `<tr><td colspan="7" style="text-align:center;color:#8c959f;padding:28px;">暂无匹配的主机名记录</td></tr>`;
		}
		tbody.innerHTML = html;
		tbody.querySelectorAll(".nn-host-link").forEach(a => {
			a.addEventListener("click", () => {
				switchView("inspect", { host: a.getAttribute("data-host") });
			});
		});
	}

	// VIEW 3: Site Inspector (Screenshot 3: 查网站)
	async function loadInspectView() {
		const inputEl = document.getElementById("nn-inspect-input");
		let hostQuery = inputEl.value.trim();
		const devFilter = document.getElementById("nn-inspect-device").value || "all";
		const daysFilter = document.getElementById("nn-inspect-days").value || "7";

		if (!hostQuery) {
			// Pick top uploaded host by default
			const sRes = await fetch(`${API_URL}?action=suspicious`);
			const sData = await sRes.json();
			if (sData.items && sData.items.length > 0) {
				hostQuery = sData.items[0].host;
				inputEl.value = hostQuery;
			}
		}
		if (!hostQuery) return;

		const res = await fetch(`${API_URL}?action=inspect&host=${encodeURIComponent(hostQuery)}&device=${encodeURIComponent(devFilter)}&days=${encodeURIComponent(daysFilter)}`);
		const data = await res.json();
		const box = document.getElementById("nn-inspect-result");
		if (!data || !data.found) {
			box.style.display = "block";
			document.getElementById("nn-ins-host").textContent = "未找到主机记录：" + hostQuery;
			return;
		}

		box.style.display = "block";
		document.getElementById("nn-ins-host").textContent = data.host;
		document.getElementById("nn-ins-up").textContent = fmtBytes(data.up);
		document.getElementById("nn-ins-up-share").textContent = `占这段时间全部上传的 ${data.up_share_pct}%`;
		document.getElementById("nn-ins-down").textContent = fmtBytes(data.down);
		document.getElementById("nn-ins-ratio").textContent = data.ratio_str;
		document.getElementById("nn-ins-conns").textContent = data.conn_count;
		document.getElementById("nn-ins-days").textContent = `${data.active_days} 天`;
		document.getElementById("nn-ins-hours").textContent = `共 ${data.active_hours} 个小时`;

		document.getElementById("nn-ins-behavior").textContent = data.behavior_summary;
		document.getElementById("nn-ins-kv-updown").innerHTML =
			`<span style="color:var(--up-color);font-weight:600;">↑ ${fmtBytes(data.up)}</span> / <span style="color:var(--down-color);font-weight:600;">↓ ${fmtBytes(data.down)}</span>`;
		document.getElementById("nn-ins-kv-conns").textContent =
			`${data.conn_count} · 平均每次连接上传 ${fmtBytes(data.avg_conn_up)}`;
		document.getElementById("nn-ins-kv-max").innerHTML =
			`<div style="color:var(--up-color);font-weight:600;">↑ ${fmtBytes(data.max_single_up)}</div><div style="font-size:12px;color:#6e7781;">从那条连接开始时算起，所以可能比这几天里传的还多。</div>`;
		document.getElementById("nn-ins-kv-active").textContent =
			`${data.active_hours} 个小时，分布在 ${data.active_days} 天`;
		document.getElementById("nn-ins-kv-night").innerHTML =
			`<span style="color:var(--up-color);">↑ ${fmtBytes(data.night_up)}</span> · 占上传的 ${data.night_pct}%`;
		document.getElementById("nn-ins-kv-idle").innerHTML =
			`<span style="color:var(--up-color);">↑ ${fmtBytes(data.idle_up)}</span> · 占上传的 ${data.idle_pct}%`;

		const notesEl = document.getElementById("nn-ins-notes");
		notesEl.innerHTML = (data.notes || []).map(n => `<div>${esc(n)}</div>`).join("");
	}

	document.getElementById("nn-inspect-btn").addEventListener("click", loadInspectView);
	document.getElementById("nn-inspect-input").addEventListener("keydown", e => {
		if (e.key === "Enter") loadInspectView();
	});

	// Demo seed button in footer
	document.getElementById("nn-seed-demo-link").addEventListener("click", async () => {
		await fetch(`${API_URL}?action=seed_demo`);
		await pollOverview();
		if (currentView === "hosts") loadHostsView();
		if (currentView === "inspect") loadInspectView();
	});

	async function pollOverview() {
		try {
			const res = await fetch(`${API_URL}?action=overview`);
			const data = await res.json();
			renderOverview(data);
		} catch (e) {
			console.error("NightNight poll error:", e);
		}
	}

	pollOverview();
	setInterval(() => {
		if (currentView === "topology") pollOverview();
	}, 2000);
})();
