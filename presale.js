(async function(){
  const $ = (id) => document.getElementById(id);
  const logEl = $("log");
  const log = (s) => {
    const ts = new Date().toISOString().replace('T',' ').replace('Z','');
    logEl.textContent = `[${ts}] ${s}\n` + logEl.textContent;
  };

  let cfg;
  try {
    cfg = await loadGobogConfig();
  } catch (e) {
    log("Config error: " + (e?.message || String(e)));
    alert("Gagal load config.json. Pastikan file config.json ada dan valid.");
    return;
  }

  const ex = $("explorerPresale");
  if (ex) ex.href = cfg.PRESALE_EXPLORER_URL || "#";

  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 value) returns (bool)"
  ];

  const presaleAbi = [
    "function buy(uint256 usdtAmount) external",
    "function claim() external",
    "function finalize() external",
    "function claimable(address user) view returns (uint256)",
    "function endTime() view returns (uint256)",
    "function canFinalizeNow() view returns (bool)"
  ];

  let provider, signer, userAddr;
  let usdt, presale;

  function fmtUnits(x, d){ try { return ethers.formatUnits(x, d); } catch(e){ return "-"; } }
  function parseUnits(x, d){ return ethers.parseUnits(x, d); }

  async function ensureNetwork(){
    if (!window.ethereum) throw new Error("Wallet tidak ditemukan. Pastikan MetaMask extension aktif.");
    const mm = new ethers.BrowserProvider(window.ethereum);
    const net = await mm.getNetwork();
    $("netName").textContent = `${cfg.CHAIN_NAME} (cfg ${cfg.CHAIN_ID}) • kamu: ${Number(net.chainId)}`;
    if (Number(net.chainId) !== Number(cfg.CHAIN_ID)) {
      log(`Network beda. Pindah ke chainId ${cfg.CHAIN_ID}.`);
    }
    return mm;
  }

  async function connect(){
    provider = await ensureNetwork();
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    userAddr = await signer.getAddress();
    $("wallet").textContent = userAddr;

    usdt = new ethers.Contract(cfg.USDT_ADDRESS, erc20Abi, signer);
    presale = new ethers.Contract(cfg.PRESALE_ADDRESS, presaleAbi, signer);

    log("Connected.");
    await refresh();
  }

  async function refresh(){
    if (!signer) return;
    try {
      const [bal, cl, end] = await Promise.all([
        usdt.balanceOf(userAddr),
        presale.claimable(userAddr),
        presale.endTime()
      ]);
      $("usdtBal").textContent = fmtUnits(bal, cfg.USDT_DECIMALS);
      $("claimable").textContent = fmtUnits(cl, cfg.TOKEN_DECIMALS);
      const endDate = new Date(Number(end) * 1000);
      $("ends").textContent = endDate.toLocaleString();
    } catch(e){
      log("Refresh error: " + (e?.shortMessage || e?.message || String(e)));
    }
  }

  async function approveUSDT(){
    const amtStr = $("amt").value.trim();
    if (!amtStr) return alert("Isi jumlah USDT dulu.");
    const amt = parseUnits(amtStr, cfg.USDT_DECIMALS);

    try {
      const allowance = await usdt.allowance(userAddr, cfg.PRESALE_ADDRESS);
      if (allowance >= amt) {
        log("Allowance sudah cukup. Tidak perlu approve lagi.");
        return;
      }
      const tx = await usdt.approve(cfg.PRESALE_ADDRESS, amt);
      log("Approve tx: " + tx.hash);
      await tx.wait();
      log("Approve confirmed.");
      await refresh();
    } catch(e){
      log("Approve error: " + (e?.shortMessage || e?.message || String(e)));
    }
  }

  async function buy(){
    const amtStr = $("amt").value.trim();
    if (!amtStr) return alert("Isi jumlah USDT dulu.");
    const amt = parseUnits(amtStr, cfg.USDT_DECIMALS);

    try {
      const allowance = await usdt.allowance(userAddr, cfg.PRESALE_ADDRESS);
      if (allowance < amt) {
        log("Allowance kurang. Klik Approve dulu.");
        return;
      }
      const tx = await presale.buy(amt);
      log("Buy tx: " + tx.hash);
      await tx.wait();
      log("Buy confirmed.");
      await refresh();
    } catch(e){
      log("Buy error: " + (e?.shortMessage || e?.message || String(e)));
    }
  }

  async function claim(){
    try {
      const tx = await presale.claim();
      log("Claim tx: " + tx.hash);
      await tx.wait();
      log("Claim confirmed.");
      await refresh();
    } catch(e){
      log("Claim error: " + (e?.shortMessage || e?.message || String(e)));
    }
  }

  async function finalize(){
    try {
      const ok = await presale.canFinalizeNow();
      if (!ok) {
        log("Belum bisa finalize (waktu belum habis / belum sold out).");
        return;
      }
      const tx = await presale.finalize();
      log("Finalize tx: " + tx.hash);
      await tx.wait();
      log("Finalize confirmed.");
      await refresh();
    } catch(e){
      log("Finalize error: " + (e?.shortMessage || e?.message || String(e)));
    }
  }

  function updateEstimate(){
    const amtStr = $("amt").value.trim();
    if (!amtStr) { $("estOut").textContent = "Est. output: -"; return; }
    const x = Number(amtStr);
    if (!isFinite(x) || x <= 0) { $("estOut").textContent = "Est. output: -"; return; }
    const out = x * Number(cfg.TOKENS_PER_1_USDT);
    $("estOut").textContent = `Est. output: ${out.toLocaleString()} GOBG`;
  }

  $("connectBtn").addEventListener("click", async (e) => {
    e.preventDefault();
    try { await connect(); }
    catch (err) {
      const msg = err?.shortMessage || err?.message || String(err);
      alert("Connect gagal: " + msg);
      log("Connect error: " + msg);
    }
  });
  $("approveBtn").addEventListener("click", approveUSDT);
  $("buyBtn").addEventListener("click", buy);
  $("claimBtn").addEventListener("click", claim);
  $("finalizeBtn").addEventListener("click", finalize);
  $("amt").addEventListener("input", updateEstimate);

  setInterval(() => { if(signer) refresh(); }, 10000);
})();
