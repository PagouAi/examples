using System.Text.Json.Nodes;
using Pagou.Examples.Core;
using Xunit;

namespace Pagou.Examples.Tests;

public class RedactorTests
{
    [Fact]
    public void Masks_Sensitive_Keys()
    {
        var output = (JsonObject)Redactor.RedactToNode(new { Authorization = "Bearer abc", token = "pgct_123", amount = 4900 })!;
        Assert.Equal("[REDACTED]", output["Authorization"]!.GetValue<string>());
        Assert.Equal("[REDACTED]", output["token"]!.GetValue<string>());
        Assert.Equal(4900, output["amount"]!.GetValue<int>());
    }

    [Fact]
    public void Masks_Card_Tokens_And_Bearer_Strings_Inside_Free_Text()
    {
        Assert.Equal("charge with [REDACTED]", Redactor.RedactText("charge with pgct_secret123"));
        Assert.Equal("header [REDACTED] here", Redactor.RedactText("header Bearer sk_live_xyz here"));
    }

    [Fact]
    public void Redacts_Nested_Structures()
    {
        var output = (JsonObject)Redactor.RedactToNode(new { buyer = new { name = "Ana", document = new { number = "19100000000" } } })!;
        var buyer = (JsonObject)output["buyer"]!;
        var document = (JsonObject)buyer["document"]!;
        Assert.Equal("Ana", buyer["name"]!.GetValue<string>());
        Assert.Equal("[REDACTED]", document["number"]!.GetValue<string>());
    }
}
