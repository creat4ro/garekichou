"use strict";
// アプリの案内や「同期とバックアップ」画面から来たときは、戻り先をその画面にする
(function(){
  let ret=null;
  try{ret=JSON.parse(sessionStorage.getItem("garekichou-return")||"null")}catch(_){}
  const labels={intro:"使い方の案内に戻る",backup:"同期とバックアップに戻る"};
  const label=ret&&labels[ret.to]?labels[ret.to]:"ガレキ積み帳に戻る";
  document.querySelectorAll("[data-back]").forEach(a=>{a.textContent="← "+label});
})();
