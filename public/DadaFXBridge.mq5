//+------------------------------------------------------------------+
//| DadaFXBridge v2 — READ-ONLY journal bridge for DadaFX Journal     |
//|                                                                   |
//| Pairing:  Brokers → MT5 → Generate pairing code → type it below.  |
//| The EA swaps the one-time code for its own credentials.           |
//| Syncs:    account snapshot + open positions + closed deals.        |
//|                                                                   |
//| READ-ONLY BY CONSTRUCTION — this file contains ZERO order         |
//| functions (no OrderSend, no PositionClose, no trade modification). |
//| Only HistorySelect + AccountInfo + PositionGet + WebRequest.       |
//|                                                                     |
//| Install (same file works for EVERY trader — no edits needed):       |
//| 1. MetaEditor → open this file → Compile (F7, expect 0 errors).    |
//| 2. MT5 → Tools → Options → Expert Advisors:                       |
//|    [x] Allow algorithmic trading                                  |
//|    [x] Allow WebRequest (URL below is pre-filled)                   |
//| 3. Drag onto ANY chart → paste YOUR pairing code from              |
//|    DadaFX → Brokers → MT5 → Generate pairing code. Done.           |
//| Each terminal pairs to its owner's journal only (per-user codes,    |
//| per-terminal tokens, RLS isolation server-side).                    |
//+------------------------------------------------------------------+
#property copyright "DadaFX Journal"
#property version   "2.1"

input string BridgeUrl   = "https://ypayyghgwbmsejehndwj.supabase.co/functions/v1/broker-sync";
input string PairingCode = "XXXX-XXXX";
input int    PushMinutes = 15;

string   GV_TOKEN = "DadaFX_BridgeToken";
string   g_token  = "";

//+------------------------------------------------------------------+
int OnInit()
{
   if(GlobalVariableCheck(GV_TOKEN))
      g_token = GlobalVariableGet(GV_TOKEN);

   EventSetTimer(MathMax(PushMinutes, 1) * 60);
   if(g_token == "")
      Pair();
   else
      Push();
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) { EventKillTimer(); }
void OnTimer() { Push(); }

//+------------------------------------------------------------------+
string JsonEsc(const string s)
{
   string r = s;
   StringReplace(r, "\\", "\\\\");
   StringReplace(r, "\"", "\\\"");
   return(r);
}

int HttpPost(const string body, char &result[])
{
   char post[];
   StringToCharArray(body, post, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(post, ArraySize(post) - 1); // drop trailing zero
   string headers = "Content-Type: application/json\r\n";
   ResetLastError();
   int code = WebRequest("POST", BridgeUrl, NULL, 20000, post, result, headers);
   if(code == -1)
      Print("DadaFX: HTTP failed — allow the URL in Tools->Options->Expert Advisors: ", GetLastError());
   return(code);
}

//+------------------------------------------------------------------+
//| Pairing: one-time code → permanent bearer (stored in terminal).   |
//+------------------------------------------------------------------+
void Pair()
{
   string code = PairingCode;
   StringReplace(code, "-", "");
   StringReplace(code, " ", "");
   if(StringLen(code) < 4)
   {
      Print("DadaFX: paste your pairing code (Brokers → MT5 → Generate) into the EA inputs.");
      return;
   }
   string body = StringFormat("{\"action\":\"mt5-pair\",\"code\":\"%s\"}", JsonEsc(code));
   char result[];
   int http = HttpPost(body, result);
   if(http != 200)
   {
      Print("DadaFX: pairing rejected (expired? already used?): ", CharArrayToString(result));
      return;
   }
   string resp = CharArrayToString(result);
   int p1 = StringFind(resp, "\"bridgeToken\":\"", 0);
   if(p1 < 0) { Print("DadaFX: pairing response unreadable."); return; }
   p1 += 15;
   int p2 = StringFind(resp, "\"", p1);
   g_token = StringSubstr(resp, p1, p2 - p1);
   GlobalVariableSet(GV_TOKEN, g_token);
   Print("DadaFX: terminal paired. Future pushes use stored credentials — code is now dead.");
   Push();
}

//+------------------------------------------------------------------+
//| Account snapshot (identifiers + balances only).                   |
//+------------------------------------------------------------------+
string AccountJson()
{
   return(StringFormat(
      "\"account\":{\"login\":%I64d,\"server\":\"%s\",\"currency\":\"%s\","
      "\"balance\":%.2f,\"equity\":%.2f,\"margin\":%.2f,\"freeMargin\":%.2f}",
      AccountInfoInteger(ACCOUNT_LOGIN),
      JsonEsc(AccountInfoString(ACCOUNT_SERVER)),
      JsonEsc(AccountInfoString(ACCOUNT_CURRENCY)),
      AccountInfoDouble(ACCOUNT_BALANCE),
      AccountInfoDouble(ACCOUNT_EQUITY),
      AccountInfoDouble(ACCOUNT_MARGIN),
      AccountInfoDouble(ACCOUNT_MARGIN_FREE)));
}

//+------------------------------------------------------------------+
//| Open positions snapshot.                                          |
//+------------------------------------------------------------------+
string PositionsJson()
{
   string items = "";
   int n = PositionsTotal();
   int sent = 0;
   for(int i = 0; i < n && sent < 200; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      long ptype = PositionGetInteger(POSITION_TYPE);
      if(ptype != POSITION_TYPE_BUY && ptype != POSITION_TYPE_SELL) continue;
      if(sent > 0) items += ",";
      items += StringFormat(
         "{\"ticket\":%I64u,\"symbol\":\"%s\",\"type\":%d,\"volume\":%.2f,"
         "\"priceIn\":%s,\"sl\":%s,\"tp\":%s,\"profit\":%.2f,\"time\":%d}",
         ticket,
         JsonEsc(PositionGetString(POSITION_SYMBOL)),
         (ptype == POSITION_TYPE_BUY ? 0 : 1),
         PositionGetDouble(POSITION_VOLUME),
         DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN), 5),
         DoubleToString(PositionGetDouble(POSITION_SL), 5),
         DoubleToString(PositionGetDouble(POSITION_TP), 5),
         PositionGetDouble(POSITION_PROFIT),
         (long)PositionGetInteger(POSITION_TIME));
      sent++;
   }
   return(items);
}

//+------------------------------------------------------------------+
//| Closed deals (last 7 days, server dedups by ticket).              |
//+------------------------------------------------------------------+
string DealsJson()
{
   datetime to   = TimeCurrent() + 60;
   datetime from = to - 7 * 24 * 3600;
   if(!HistorySelect(from, to)) return("");

   string items = "";
   int sent = 0;
   int total = HistoryDealsTotal();
   for(int i = 0; i < total && sent < 500; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;
      if((long)HistoryDealGetInteger(ticket, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;
      long dtype = HistoryDealGetInteger(ticket, DEAL_TYPE);
      if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL) continue;

      long     positionId = (long)HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      double   priceIn = 0; datetime timeIn = 0;
      // match the opening leg for true entry price/time
      for(int j = 0; j < total; j++)
      {
         ulong t2 = HistoryDealGetTicket(j);
         if(t2 == 0) continue;
         if((long)HistoryDealGetInteger(t2, DEAL_POSITION_ID) != positionId) continue;
         if((long)HistoryDealGetInteger(t2, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;
         priceIn = HistoryDealGetDouble(t2, DEAL_PRICE);
         timeIn  = (datetime)HistoryDealGetInteger(t2, DEAL_TIME);
         break;
      }

      if(sent > 0) items += ",";
      items += StringFormat(
         "{\"ticket\":%I64u,\"symbol\":\"%s\",\"type\":%d,\"volume\":%.2f,"
         "\"priceIn\":%s,\"priceOut\":%s,\"timeIn\":%d,\"timeOut\":%d,"
         "\"sl\":%s,\"tp\":%s,\"profit\":%.2f,\"commission\":%.2f,\"swap\":%.2f}",
         ticket,
         JsonEsc(HistoryDealGetString(ticket, DEAL_SYMBOL)),
         (dtype == DEAL_TYPE_BUY ? 0 : 1),
         HistoryDealGetDouble(ticket, DEAL_VOLUME),
         DoubleToString(priceIn, 5),
         DoubleToString(HistoryDealGetDouble(ticket, DEAL_PRICE), 5),
         (long)timeIn,
         (long)HistoryDealGetInteger(ticket, DEAL_TIME),
         DoubleToString(HistoryDealGetDouble(ticket, DEAL_SL), 5),
         DoubleToString(HistoryDealGetDouble(ticket, DEAL_TP), 5),
         HistoryDealGetDouble(ticket, DEAL_PROFIT),
         HistoryDealGetDouble(ticket, DEAL_COMMISSION),
         HistoryDealGetDouble(ticket, DEAL_SWAP));
      sent++;
   }
   return(items);
}

//+------------------------------------------------------------------+
void Push()
{
   if(g_token == "")
   {
      Pair(); // not paired yet — pairing doubles as first push
      return;
   }
   string body = StringFormat("{\"action\":\"mt5-push\",\"bridgeToken\":\"%s\",%s,\"positions\":[%s],\"deals\":[%s]}",
                              g_token, AccountJson(), PositionsJson(), DealsJson());
   char result[];
   int http = HttpPost(body, result);
   if(http == 401)
   {
      Print("DadaFX: token rejected — generate a fresh pairing code and re-pair.");
      GlobalVariableDel(GV_TOKEN);
      g_token = "";
   }
   else if(http == 200)
      Print("DadaFX: sync OK: ", CharArrayToString(result));
   else if(http != -1)
      Print("DadaFX: server said ", http, ": ", CharArrayToString(result));
}
//+------------------------------------------------------------------+
