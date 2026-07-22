using Pagou.Examples.Payments;

// Single entry point for the payments flow. Each operation is a subcommand so
// the flow ships one run command: `dotnet run --project payments -- <command>`.
var command = args.Length > 0 ? args[0] : "pix";
var rest = args.Skip(1).ToArray();

try
{
    switch (command)
    {
        case "pix":
            await PaymentsFlows.CreatePixAsync();
            break;
        case "voucher":
            await PaymentsFlows.CreateVoucherAsync();
            break;
        case "card":
            await PaymentsFlows.CreateCardAsync(rest);
            break;
        case "retrieve":
            await PaymentsFlows.RetrieveAsync(rest);
            break;
        case "reconcile":
            await PaymentsFlows.ReconcileAsync(rest);
            break;
        case "refund":
            await PaymentsFlows.RefundAsync(rest);
            break;
        case "list":
            await PaymentsFlows.ListAsync();
            break;
        case "sandbox-advance":
            await PaymentsFlows.SandboxAdvanceAsync(rest);
            break;
        case "card-server":
            await CardServer.RunAsync();
            break;
        default:
            Console.Error.WriteLine(
                $"Unknown command '{command}'. Try: pix, voucher, card, retrieve, reconcile, refund, list, sandbox-advance, card-server.");
            Environment.Exit(1);
            break;
    }
}
catch (Exception error)
{
    Console.Error.WriteLine(error);
    Environment.Exit(1);
}
