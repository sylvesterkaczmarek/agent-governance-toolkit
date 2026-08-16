// Copyright (c) Microsoft Corporation. Licensed under the MIT License.

using AgentGovernance.Policy;
using Xunit;

namespace AgentGovernance.Tests;

public sealed class PolicyRuleNumericEqualityTests
{
    [Fact]
    public void Evaluate_NumericEquality_MatchesIntegerValue()
    {
        var rule = new PolicyRule
        {
            Name = "numeric-equality",
            Condition = "count == 5",
            Action = PolicyAction.Allow
        };

        var context = new Dictionary<string, object> { ["count"] = 5 };

        Assert.True(rule.Evaluate(context));
    }

    [Theory]
    [InlineData("count != 5", 4.0, true)]
    [InlineData("count != 5", 5.0, false)]
    [InlineData("score == 3.14", 3.14, true)]
    [InlineData("score != 3.14", 3.15, true)]
    [InlineData("temperature == -5", -5.0, true)]
    [InlineData("temperature != -5", -5.0, false)]
    public void Evaluate_NumericEqualityAndInequality_EvaluatesUnquotedLiterals(
        string condition,
        double value,
        bool expected)
    {
        var rule = new PolicyRule
        {
            Name = "numeric-comparison",
            Condition = condition,
            Action = PolicyAction.Allow
        };

        var context = new Dictionary<string, object>
        {
            [condition.Split(' ', StringSplitOptions.RemoveEmptyEntries)[0]] = value
        };

        Assert.Equal(expected, rule.Evaluate(context));
    }
}
