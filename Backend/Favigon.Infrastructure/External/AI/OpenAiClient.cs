using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Favigon.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Favigon.Infrastructure.External.AI;

public class OpenAiClient : IAiClient
{
  private readonly HttpClient _httpClient;
  private readonly string _model;
  private readonly ILogger<OpenAiClient> _logger;

  public OpenAiClient(HttpClient httpClient, IConfiguration configuration, ILogger<OpenAiClient> logger)
  {
    _httpClient = httpClient;
    _logger = logger;

    var apiKey = configuration["OpenAi:ApiKey"];
    if (string.IsNullOrWhiteSpace(apiKey))
      throw new InvalidOperationException("OpenAi:ApiKey is not configured.");

    _model = configuration["OpenAi:Model"] ?? "gpt-5.4-mini";

    _httpClient.BaseAddress = new Uri("https://api.openai.com/");
    _httpClient.DefaultRequestHeaders.Authorization =
        new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
  }

  public async Task<string> ChatCompletionAsync(string systemPrompt, string userMessage, string? modelOverride = null, string? jsonSchema = null, CancellationToken ct = default)
  {
    var payload = new OpenAiChatRequest
    {
      Model = string.IsNullOrWhiteSpace(modelOverride) ? _model : modelOverride,
      ResponseFormat = BuildResponseFormat(jsonSchema),
      Messages =
      [
        new ChatMessage { Role = "system", Content = systemPrompt },
        new ChatMessage { Role = "user", Content = userMessage }
      ],
      Temperature = 0.7,
      MaxCompletionTokens = 32000
    };

    var response = await _httpClient.PostAsJsonAsync("v1/chat/completions", payload, ct);

    if (!response.IsSuccessStatusCode)
    {
      var body = await response.Content.ReadAsStringAsync(ct);
      _logger.LogError("OpenAI API error {Status}: {Body}", (int)response.StatusCode, body);
      throw new InvalidOperationException($"OpenAI API returned {(int)response.StatusCode}.");
    }

    var result = await response.Content.ReadFromJsonAsync<OpenAiChatResponse>(ct);
    var content = result?.Choices?.FirstOrDefault()?.Message?.Content;

    if (string.IsNullOrWhiteSpace(content))
      throw new InvalidOperationException("OpenAI returned an empty response.");

    return content;
  }

  public async IAsyncEnumerable<string> StreamChatCompletionAsync(
      string systemPrompt,
      string userMessage,
      string? modelOverride = null,
      string? jsonSchema = null,
      [EnumeratorCancellation] CancellationToken ct = default)
  {
    var payload = new OpenAiChatRequest
    {
      Model = string.IsNullOrWhiteSpace(modelOverride) ? _model : modelOverride,
      ResponseFormat = BuildResponseFormat(jsonSchema),
      Messages =
      [
        new ChatMessage { Role = "system", Content = systemPrompt },
        new ChatMessage { Role = "user", Content = userMessage }
      ],
      Temperature = 0.7,
      MaxCompletionTokens = 32000,
      Stream = true
    };

    var json = JsonSerializer.Serialize(payload);
    using var requestMessage = new HttpRequestMessage(HttpMethod.Post, "v1/chat/completions")
    {
      Content = new StringContent(json, Encoding.UTF8, "application/json")
    };

    using var response = await _httpClient.SendAsync(
        requestMessage, HttpCompletionOption.ResponseHeadersRead, ct);

    if (!response.IsSuccessStatusCode)
    {
      var body = await response.Content.ReadAsStringAsync(ct);
      _logger.LogError("OpenAI streaming API error {Status}: {Body}", (int)response.StatusCode, body);
      throw new InvalidOperationException($"OpenAI API returned {(int)response.StatusCode}.");
    }

    using var stream = await response.Content.ReadAsStreamAsync(ct);
    using var reader = new StreamReader(stream);

    while (!reader.EndOfStream)
    {
      ct.ThrowIfCancellationRequested();
      var line = await reader.ReadLineAsync(ct);

      if (string.IsNullOrEmpty(line))
        continue;

      if (!line.StartsWith("data: "))
        continue;

      var data = line["data: ".Length..];

      if (data == "[DONE]")
        yield break;

      var chunk = JsonSerializer.Deserialize<StreamChunk>(data);
      var delta = chunk?.Choices?.FirstOrDefault()?.Delta?.Content;

      if (!string.IsNullOrEmpty(delta))
        yield return delta;
    }
  }

  private static ResponseFormat BuildResponseFormat(string? jsonSchema)
  {
    if (string.IsNullOrEmpty(jsonSchema))
      return new ResponseFormat { Type = "json_object" };

    JsonElement schemaElement;
    using (var doc = JsonDocument.Parse(jsonSchema))
      schemaElement = doc.RootElement.Clone();

    return new ResponseFormat
    {
      Type = "json_schema",
      JsonSchema = new JsonSchemaWrapper { Schema = schemaElement }
    };
  }


  private class OpenAiChatRequest
  {
    [JsonPropertyName("model")]
    public string Model { get; set; } = "";

    [JsonPropertyName("messages")]
    public List<ChatMessage> Messages { get; set; } = [];

    [JsonPropertyName("response_format")]
    public ResponseFormat? ResponseFormat { get; set; }

    [JsonPropertyName("temperature")]
    public double Temperature { get; set; } = 0.7;

    [JsonPropertyName("max_completion_tokens")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? MaxCompletionTokens { get; set; }

    [JsonPropertyName("stream")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public bool Stream { get; set; }
  }

  private class ResponseFormat
  {
    [JsonPropertyName("type")]
    public string Type { get; set; } = "json_object";

    [JsonPropertyName("json_schema")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public JsonSchemaWrapper? JsonSchema { get; set; }
  }

  private class JsonSchemaWrapper
  {
    [JsonPropertyName("name")]
    public string Name { get; set; } = "ir_node";

    [JsonPropertyName("strict")]
    public bool Strict { get; set; } = false;

    [JsonPropertyName("schema")]
    public JsonElement Schema { get; set; }
  }

  private class ChatMessage
  {
    [JsonPropertyName("role")]
    public string Role { get; set; } = "";

    [JsonPropertyName("content")]
    public string Content { get; set; } = "";
  }

  private class OpenAiChatResponse
  {
    [JsonPropertyName("choices")]
    public List<Choice>? Choices { get; set; }
  }

  private class Choice
  {
    [JsonPropertyName("message")]
    public ChatMessage? Message { get; set; }
  }

  private class StreamChunk
  {
    [JsonPropertyName("choices")]
    public List<StreamChoice>? Choices { get; set; }
  }

  private class StreamChoice
  {
    [JsonPropertyName("delta")]
    public ChatMessage? Delta { get; set; }
  }
}
